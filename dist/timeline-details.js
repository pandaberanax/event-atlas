import {t, locale} from './i18n.js';
import {eventPlatform, platformName, androidPlatformName} from './platforms.js';

const $ = id => document.getElementById(id);
const MAX_PREVIEW = 32768;
export const evidenceSource = source => source === 'network' ? t('network')
  : source === 'gtag' ? 'gtag()' : source === 'dataLayer' ? 'dataLayer'
  : source === 'logcat' ? t('androidEvidence') : source === 'moengage-logcat' ? t('androidMoengageEvidence')
  : source === 'android-diagnostic' ? t('androidDiagnosticEvidence') : '';

export function createTimelineDetails() {
  const dialog = $('timelineDetailsDialog');
  let selected;
  let request;

  function render() {
    if (!selected) return;
    const {entry, evidence, status, android} = selected;
    const body = $('timelineDetailsBody');
    body.replaceChildren();
    const activity = t('timelineType_' + entry.type);
    $('timelineDetailsKind').textContent = activity;
    const label = typeof entry.element?.text === 'string' ? entry.element.text : activity;
    $('timelineDetailsTitle').textContent = typeof entry.name === 'string' ? entry.name : label;

    function field(key, value, code = false) {
      if (value === undefined || value === null || value === '') return;
      const section = document.createElement('div');
      section.className = 'detail-field';
      const label = document.createElement('div');
      label.className = 'timeline-detail-label';
      label.textContent = t(key);
      const content = document.createElement(code ? 'pre' : 'div');
      if (code && android) {
        content.className = 'android-detail-code';
        content.tabIndex = 0;
        content.setAttribute('aria-label',t(key));
      }
      content.textContent = value;
      section.append(label, content);
      body.append(section);
    }

    const time = new Intl.DateTimeFormat(locale(), {hour:'2-digit', minute:'2-digit', second:'2-digit', fractionalSecondDigits:3});
    field('timelineTime', time.format(entry.time));
    const location = android ? entry.screen : entry.page;
    field(android ? 'androidScreen' : 'pageLabel', typeof location === 'string' ? location : undefined);
    if (entry.type === 'event' || entry.type === 'diagnostic') {
      const platform = eventPlatform(entry);
      field('platform', typeof platform === 'string' ? (android ? androidPlatformName(platform) : platformName(platform)) : undefined);
      field('evidence', evidenceSource(entry.source));
      if (evidence) {
        if (android && Number.isSafeInteger(evidence.loggedAt) && evidence.loggedAt > 0 && evidence.loggedAt <= 8640000000000000) {
          field('androidLoggedAt',time.format(evidence.loggedAt));
        }
        if (entry.type === 'event') {
          const params = evidence.parameters;
          const preview = params && typeof params === 'object' && Object.keys(params).length ? JSON.stringify(params, null, 2) : '';
          field('parameters', (android ? preview : preview.slice(0,MAX_PREVIEW)) || t('timelineNoParameters'), !!preview);
          if (evidence.parametersRedacted === true) field('timelineNote', t('timelineRedacted'));
          if (evidence.parametersTruncated === true || !android && preview.length > MAX_PREVIEW) {
            field('timelineNote', t(android ? 'androidTruncated' : 'timelineTruncated'));
          }
        }
        if (android && typeof evidence.logMessage === 'string') field('androidRawLog',evidence.logMessage,true);
        field('measurement', typeof evidence.measurementId === 'string' ? evidence.measurementId : undefined);
        field('httpStatus', Number.isInteger(evidence.httpStatus) ? evidence.httpStatus : undefined);
        field('endpoint', typeof evidence.endpoint === 'string' ? evidence.endpoint : undefined);
        field('payloadPage', typeof evidence.reportedPage === 'string' ? evidence.reportedPage : undefined);
      } else field('parameters', t(status || 'timelineEvidenceUnavailable'));
    }
    const element = entry.element;
    if (typeof element?.text === 'string') field(entry.type === 'event'
      ? (android ? 'androidTapContext' : 'timelineClickContext') : 'timelineElement', element.text);
    if (typeof element?.tag === 'string') field('timelineTag', element.tag);
    if (typeof element?.region === 'string') field('timelineRegion', element.region);
    if (typeof element?.selector === 'string') field('selector', element.selector, true);
    if (entry.type === 'scroll' && Number.isSafeInteger(entry.position)) {
      field('timelineScroll', t('timelinePosition', {position:entry.position}));
    }
  }

  $('closeTimelineDetails').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    request?.abort();
    const opener = selected?.opener;
    selected = undefined;
    if (opener) {
      const button = [...document.querySelectorAll('[data-timeline-detail]')]
        .find(candidate => candidate.dataset.timelineDetail === opener);
      (button || $('timelineActivityFilter')).focus();
    }
  });

  async function open(entry, {id, token, fromFile, opener, android}) {
    request?.abort();
    selected = {entry, evidence: entry.evidence, opener, android};
    const record = selected;
    const load = !fromFile && !!entry.detailAvailable;
    if (load) record.status = 'timelineEvidenceLoading';
    else if (entry.detailAvailable === false) record.status = 'timelineEvidenceLimited';
    render();
    dialog.showModal();
    if (!load) return;
    request = new AbortController();
    try {
      const query = new URLSearchParams({id, detail: entry.eventId});
      const response = await fetch('/api/manual/live?' + query, {
        headers: {'X-Atlas-Token':token}, cache:'no-store',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(3500)])
      });
      if (!response.ok) throw Error('unavailable');
      record.evidence = (await response.json()).detail;
      record.status = undefined;
    } catch {
      record.status = 'timelineEvidenceUnavailable';
    }
    if (selected === record) render();
  }

  return {open, render};
}
