import {t, locale} from './i18n.js';
import {eventPlatform, platformName, androidPlatformName, PLATFORM_IDS} from './platforms.js';
import {ACTIVITY_TYPES, importedTimeline} from './timeline-model.js';
import {createTimelineDetails, evidenceSource} from './timeline-details.js';
import {createAndroidControls, importAndroid} from './android.js';

const $ = id => document.getElementById(id);
const PAGE_SIZE = 40;

export function createTimeline() {
  let token = '';
  let visible = false;
  let inFlight = false;
  let timer;
  let imported;
  let live = {status: 'offline', pairing: '', rows: []};
  let page = 0;
  let renderedFeedId;
  const details = createTimelineDetails();
  const android = createAndroidControls({token:() => token,onChange:render});
  const activityFilter = $('timelineActivityFilter');
  const platformFilter = $('timelineAndroidPlatform');
  for (const type of [...ACTIVITY_TYPES,'screen','tap','diagnostic']) {
    const option = document.createElement('option');
    option.value = type;
    option.dataset.i18n = 'timelineType_' + type;
    activityFilter.append(option);
  }

  function render() {
    const fromFile = $('timelineSource').value === 'file' && !!imported;
    const androidLive = $('timelineSource').value === 'android';
    const feed = fromFile ? imported : androidLive ? android.feed() : live;
    const feedKey = (fromFile ? 'file' : androidLive ? 'android:' : 'web:') + (feed.id || '');
    if (feedKey !== renderedFeedId) {page = 0; renderedFeedId = feedKey;}
    $('timelinePairing').hidden = fromFile || androidLive;
    $('timelineHowTo').hidden = androidLive;
    $('androidControls').hidden = !androidLive;
    $('timelineAndroidPlatformField').hidden = !feed.android;
    if (androidLive) android.render();
    $('timelineLocationHeader').textContent = t(feed.android ? 'androidScreen' : 'pageLabel');
    $('timelineSubtitle').textContent = t(feed.android ? 'androidTimelineSubtitle' : 'timelineSubtitle');
    $('timelineKey').value = live.pairing || '';
    $('timelineCopy').disabled = !live.pairing;
    $('timelineFile').disabled = !imported;
    $('timelineStatus').textContent = t('timeline_' + feed.status);
    $('timelineStatus').dataset.state = feed.status;
    $('timelineRoot').textContent = feed.root || '';
    const allowed = feed.android ? ['all','event','screen','tap','diagnostic'] : ['all',...ACTIVITY_TYPES];
    for (const option of activityFilter.options) {
      option.hidden = !allowed.includes(option.value);
      option.disabled = option.hidden;
    }
    if (!allowed.includes(activityFilter.value)) activityFilter.value = 'all';
    const type = activityFilter.value;
    const selectedPlatform = feed.android ? platformFilter.value : 'all';
    const rows = feed.rows.map((entry, index) => ({entry, index}))
      .filter(({entry}) => type === 'all' || entry.type === type)
      .filter(({entry}) => selectedPlatform === 'all' || entry.platform === selectedPlatform)
      .sort((a, b) => b.entry.time - a.entry.time || b.index - a.index);
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(page, totalPages - 1);
    $('timelineCount').textContent = t(type === 'all' && selectedPlatform === 'all' ? 'timelineCount' : 'timelineFilteredCount', {
      count: rows.length.toLocaleString(locale()), total: feed.rows.length.toLocaleString(locale())
    });
    $('timelinePage').textContent = (page + 1) + ' / ' + totalPages;
    $('timelineNewer').disabled = page === 0;
    $('timelineOlder').disabled = page >= totalPages - 1;
    $('timelineEmpty').hidden = rows.length > 0;
    $('timelineEmpty').querySelector('p').textContent = selectedPlatform !== 'all'
      ? t('androidPlatformEmpty', {platform:androidPlatformName(selectedPlatform)})
      : t(type === 'all' ? (feed.android ? 'androidEmpty' : 'timelineEmpty') : 'timelineNoMatches');
    const clock = new Intl.DateTimeFormat(locale(), {hour: '2-digit', minute: '2-digit', second: '2-digit'});
    const fragment = document.createDocumentFragment();
    const focused = document.activeElement?.dataset.timelineDetail;
    let focusTarget;
    for (const {entry, index} of rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const row = document.createElement('tr');
      row.dataset.activity = entry.type;
      const time = row.insertCell();
      time.textContent = clock.format(entry.time);
      const kind = row.insertCell();
      const badge = document.createElement('span');
      badge.className = 'timeline-kind';
      badge.textContent = t('timelineType_' + entry.type);
      kind.append(badge);
      const platform = row.insertCell();
      if ((entry.type === 'event' || entry.type === 'diagnostic') && typeof eventPlatform(entry) === 'string') {
        const id = eventPlatform(entry);
        const tag = document.createElement('span');
        tag.className = 'platform-badge';
        if (PLATFORM_IDS.includes(id)) tag.classList.add(id);
        tag.textContent = feed.android ? androidPlatformName(id) : platformName(id);
        platform.append(tag);
      } else platform.textContent = '—';
      const location = row.insertCell();
      const where = feed.android ? entry.screen : entry.page;
      location.textContent = typeof where === 'string' && where ? where : '—';
      const detail = row.insertCell();
      const label = typeof entry.element?.text === 'string' ? entry.element.text : '';
      if (entry.type === 'event') {
        const name = document.createElement('strong');
        name.textContent = typeof entry.name === 'string' ? entry.name : '—';
        const evidence = document.createElement('small');
        const context = label ? t(feed.android ? 'androidNearTap' : 'timelineNearClick', {element:label}) : '';
        evidence.textContent = [evidenceSource(entry.source), context].filter(Boolean).join(' · ');
        detail.append(name, evidence);
        if (feed.android && entry.evidence?.parameters && typeof entry.evidence.parameters === 'object') {
          const values = Object.entries(entry.evidence.parameters)
            .filter(([,value]) => ['string','number','boolean'].includes(typeof value)).slice(0,2);
          if (values.length) {
            const preview = document.createElement('small');
            preview.className = 'android-parameter-preview';
            preview.textContent = values.map(([key,value]) => key.slice(0,36) + '=' + String(value).slice(0,55)).join(' · ');
            detail.append(preview);
          }
        }
      } else if (entry.type === 'diagnostic') {
        const name = document.createElement('strong');
        name.textContent = typeof entry.name === 'string' ? entry.name : '—';
        const preview = document.createElement('small');
        const message = entry.evidence?.logMessage;
        if (typeof message === 'string') preview.textContent = message.length > 100 ? message.slice(0,100) + '…' : message;
        detail.append(name,preview);
      } else {
        const position = Number.isSafeInteger(entry.position) ? entry.position : 0;
        detail.textContent = entry.type === 'scroll' ? t('timelinePosition', {position}) : (label || '—');
        if (typeof entry.element?.selector === 'string') detail.title = entry.element.selector;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-button timeline-open-detail';
      button.textContent = t('viewDetails') + ' ↗';
      const name = typeof entry.name === 'string' ? entry.name : label || badge.textContent;
      button.setAttribute('aria-label', t('timelineDetailsFor', {name}));
      const opener = feedKey + ':' + index;
      button.dataset.timelineDetail = opener;
      button.onclick = () => details.open(entry, {id: feed.id, token, fromFile:fromFile || androidLive, opener, android:feed.android});
      if (opener === focused) focusTarget = button;
      detail.append(button);
      fragment.append(row);
    }
    $('timelineRows').replaceChildren(fragment);
    if (focused) (focusTarget || activityFilter).focus({preventScroll:true});
  }

  async function refresh() {
    if (!visible || !token || inFlight) return;
    inFlight = true;
    clearTimeout(timer);
    let nextDelay = 650;
    try {
      if ($('timelineSource').value === 'android') {
        nextDelay = await android.refresh();
        return;
      }
      const query = new URLSearchParams({id: live.id || '', offset: live.rows.length});
      const response = await fetch('/api/manual/live?' + query, {
        headers: {'X-Atlas-Token': token}, cache: 'no-store', signal: AbortSignal.timeout(3500)
      });
      if (!response.ok) throw Error('unavailable');
      const data = await response.json();
      if (data.id !== live.id) {
        live.rows = [];
        if ($('timelineSource').value === 'live') page = 0;
      }
      const changed = data.id !== live.id || data.status !== live.status || data.pairing !== live.pairing || data.rows?.length;
      if (data.rows?.length) live.rows.push(...data.rows);
      live = {...live, id: data.id, pairing: data.pairing, root: data.root, status: data.status};
      if (changed) render();
      if (live.rows.length < data.total) nextDelay = 30;
    } catch {
      if ($('timelineSource').value !== 'android' && live.status !== 'offline') {
        live.status = 'offline';
        live.pairing = '';
        render();
      }
      nextDelay = 1500;
    } finally {
      inFlight = false;
      if (visible) timer = setTimeout(refresh, nextDelay);
    }
  }

  $('timelineSource').onchange = () => {page = 0; render(); void refresh();};
  activityFilter.onchange = () => {
    if (['screen','tap'].includes(activityFilter.value)) platformFilter.value = 'all';
    page = 0;
    render();
  };
  platformFilter.onchange = () => {
    if (platformFilter.value !== 'all' && ['screen','tap'].includes(activityFilter.value)) activityFilter.value = 'all';
    page = 0;
    render();
  };
  $('timelineNewer').onclick = () => {page--; render();};
  $('timelineOlder').onclick = () => {page++; render();};
  $('timelineCopy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(live.pairing);
      $('timelineCopyFeedback').textContent = t('copied');
    } catch {
      $('timelineKey').select();
      $('timelineCopyFeedback').textContent = t('copyFallback');
    }
  };
  return {
    render() {render(); details.render();},
    connect(value) {token = value; void refresh();},
    show(value) {
      visible = value;
      if (visible) {render(); void refresh();}
      else clearTimeout(timer);
    },
    load(report) {
      const rows = importedTimeline(report);
      imported = rows.length ? {root: report.root, rows, status: 'imported'} : undefined;
      $('timelineSource').value = imported ? 'file' : 'live';
      page = 0;
      render();
    },
    loadAndroid(report) {
      imported = importAndroid(report);
      $('timelineFile').disabled = false;
      $('timelineSource').value = 'file';
      page = 0;
      render();
    }
  };
}
