import {eventPlatform} from './platforms.js';

export const ACTIVITY_TYPES = ['navigation', 'click', 'scroll', 'submit', 'pause', 'resume', 'event'];
const types = new Set(ACTIVITY_TYPES);

function evidenceKey(row, time, platform) {
  return JSON.stringify([time, row.page, row.name, platform, row.source, row.actionId ?? null]);
}

export function importedTimeline(report) {
  const rows = Array.isArray(report.timeline) ? report.timeline.filter(row =>
    types.has(row?.type) && Number.isSafeInteger(row.time) && row.time > 0 && row.time <= 8640000000000000) : [];
  if (!rows.some(row => row.type === 'event')) return rows;

  const byId = new Map();
  const legacy = new Map();
  const needsLegacy = rows.some(row => row.type === 'event' && !row.eventId);
  for (const event of report.events || []) {
    byId.set(event.id, event);
    if (!needsLegacy) continue;
    const key = evidenceKey(event, Date.parse(event.time), eventPlatform(event));
    if (!legacy.has(key)) legacy.set(key, {events: [], next: 0});
    legacy.get(key).events.push(event);
  }
  return rows.map(row => {
    if (row.type !== 'event') return row;
    const pool = row.eventId ? null : legacy.get(evidenceKey(row, row.time, eventPlatform(row)));
    const evidence = byId.get(row.eventId) || (pool ? pool.events[pool.next++] : undefined);
    return evidence ? {...row, evidence} : row;
  });
}
