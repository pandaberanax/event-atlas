import {parseCollect, parseVendorPayload} from './network-events.js';
import {timelineEvidence} from './timeline-evidence.js';

const PLATFORM_NAMES = {ga4: 'GA4', dataLayer: 'dataLayer', moengage: 'MoEngage', braze: 'Braze', mixpanel: 'Mixpanel'};
const CLICK_WINDOW_MS = 1500;

export function createRecording(root, version, started = Date.now()) {
  const origin = new URL(root).origin;
  const pages = new Map();
  const routeHistory = [];
  const events = [];
  const timeline = [];
  let nextAction = 0;
  let since = started;
  let pausedAt;
  let pausedMs = 0;
  let documentId;
  let snapshotPage;
  let lastRead = started;

  function append(entry) {
    timeline.push(entry);
  }

  function sameOrigin(value) {
    try { return new URL(value).origin === origin; } catch { return false; }
  }
  function addPage(url, title) {
    if (!pages.has(url)) pages.set(url, {url, title: '', status: 'ok', actions: [], tags: []});
    const page = pages.get(url);
    if (title) page.title = title;
    return page;
  }
  function navigate(url, time = Date.now(), title, reload = false) {
    if (!sameOrigin(url)) return false;
    addPage(url, title);
    if (reload || routeHistory.at(-1)?.url !== url) {
      routeHistory.push({url, time});
      append({type: 'navigation', page: url, time});
    }
    return true;
  }
  function observe(hit, page, time, status, observedSince) {
    if (!sameOrigin(page) || !hit.name) return;
    const {actions, tags} = addPage(page);
    const label = PLATFORM_NAMES[hit.platform];
    if (!tags.includes(label)) tags.push(label);
    const isPageEvent = /^(page_view|gtm_pageview|gtm\.js|gtm\.dom|gtm\.load)$/i.test(hit.name);
    let click;
    if (!isPageEvent && !hit.batch) {
      const isRecent = action => action.time >= since && action.time <= time && time - action.time <= CLICK_WINDOW_MS;
      if (observedSince === undefined) click = actions.findLast(isRecent);
      else {
        // A queue read gives a time range. Multiple clicks in that range make context ambiguous.
        for (let i = actions.length - 1; i >= 0 && actions[i].time >= observedSince; i--) {
          if (!isRecent(actions[i])) continue;
          if (click) {click = undefined; break;}
          click = actions[i];
        }
      }
    }
    const observation = {
      ...hit, id: 'manual-event-' + (events.length + 1), count: 1, page, originPage: page,
      eventPage: page, frameUrl: page, time: new Date(time).toISOString(), httpStatus: status || null,
      action: click ? 'click' : 'manualObservation', actionId: click?.id, element: click?.element,
      relationship: click ? 'after-click' : hit.batch ? 'batch' : 'page',
      eventCategory: isPageEvent ? 'page' : 'other', captureMode: 'manual', provenanceVersion: version
    };
    events.push(observation);
    append({type: 'event', page, time, name: hit.name, platform: hit.platform, source: hit.source,
      actionId: click?.id, element: click?.element, eventId: observation.id, observation});
  }
  function read(snapshot, until = Infinity) {
    if (!snapshot || pausedAt !== undefined) return;
    const reload = !!documentId && documentId !== snapshot.documentId && snapshotPage === snapshot.page &&
      routeHistory.at(-1)?.url === snapshot.page;
    if (snapshot.time <= until) {
      if (!navigate(snapshot.page, snapshot.time, snapshot.title, reload)) return;
      documentId = snapshot.documentId;
      snapshotPage = snapshot.page;
    }
    for (const activity of snapshot.activities) {
      if (!sameOrigin(activity.page) || activity.time < since || activity.time > until) continue;
      if (activity.type === 'click') {
        const id = 'manual-click-' + (++nextAction);
        addPage(activity.page).actions.push({...activity, id, status: 'tested', trigger: 'click'});
        append({...activity, actionId: id});
      } else append(activity);
    }
    for (const hit of snapshot.events) {
      if (hit.time >= since && hit.time <= until) {
        observe({...hit, platform: hit.source === 'gtag' ? 'ga4' : 'dataLayer'}, snapshot.page, hit.time, undefined, lastRead);
      }
    }
    lastRead = snapshot.time;
  }
  // Network completions and page polling run independently. Consume after a page read.
  function network(har) {
    const time = Date.parse(har.startedDateTime);
    const request = har.request;
    if (!request?.url || !Number.isFinite(time) || time < since || pausedAt !== undefined) return;
    const body = request.postData?.text || '';
    const headers = {'x-braze-api-key': request.headers?.some(header => header.name.toLowerCase() === 'x-braze-api-key')};
    const hits = [
      ...parseCollect(request.url, body).map(hit => ({...hit, platform: 'ga4'})),
      ...parseVendorPayload(request.url, body, headers)
    ];
    const route = routeHistory.findLast(entry => entry.time <= time)?.url || root;
    for (const hit of hits) {
      const page = pages.has(hit.reportedPage) ? hit.reportedPage : route;
      observe({...hit, source: 'network'}, page, time, har.response?.status);
    }
  }
  function pause(time = Date.now()) {
    if (pausedAt !== undefined) return;
    pausedAt = time;
    append({type: 'pause', time, page: routeHistory.at(-1).url});
  }
  function resume(page, time = Date.now()) {
    if (pausedAt === undefined || !sameOrigin(page)) return false;
    pausedMs += Math.max(0, time - pausedAt);
    pausedAt = undefined;
    since = time;
    lastRead = time;
    documentId = undefined;
    navigate(page, time);
    append({type: 'resume', time, page});
    return true;
  }
  function report(finished = Date.now()) {
    const observedPages = [...pages.values()];
    const networkHits = events.filter(event => event.source === 'network');
    const names = hits => new Set(hits.map(event => JSON.stringify([event.platform, event.name]))).size;
    return {
      schemaVersion: 1, appVersion: version, mode: 'manual', id: 'manual-' + started, root,
      status: 'completed', startedAt: new Date(started).toISOString(), finishedAt: new Date(finished).toISOString(),
      durationMs: Math.max(0, (pausedAt ?? finished) - started - pausedMs),
      options: {platforms: Object.keys(PLATFORM_NAMES)}, pages: observedPages, events,
      timeline: timeline.map(({observation, ...entry}) => entry).sort((a,b) => a.time - b.time),
      discovery: {urls: [...pages.keys()], sitemaps: [], errors: []},
      summary: {
        discovered: pages.size, visited: pages.size, completed: pages.size, successful: pages.size,
        remaining: 0, failed: 0, attention: 0, testedElements: nextAction, skippedElements: 0,
        eventNames: names(events), networkEventNames: names(networkHits), observations: events.length
      }
    };
  }
  navigate(root, started);
  return {
    navigate, read, network, pause, resume, report,
    delta: (offset, count) => timeline.slice(offset, offset + count).map(({observation, ...entry}) =>
      observation ? {...entry, details: timelineEvidence(observation)} : entry),
    counts: () => ({pages: pages.size, clicks: nextAction, events: events.length, activities: timeline.length - events.length})
  };
}
