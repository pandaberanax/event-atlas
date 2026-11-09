import {randomBytes} from 'node:crypto';
import {timelineEvidence} from './manual/timeline-evidence.js';

const PATH = '/api/manual/live';
const TYPES = new Set(['navigation', 'click', 'scroll', 'submit', 'pause', 'resume', 'event']);
const STATUSES = new Set(['recording', 'paused', 'completed']);
const MAX_ROWS = 50000;
const MAX_BYTES = 1024 * 1024;
const MAX_DETAIL_BYTES = 16 * 1024 * 1024;
const STALE_MS = 15000;
const isExtension = origin => /^chrome-extension:\/\/[a-p]{32}$/.test(origin || '');
const SESSION_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const EVENT_ID = /^manual-event-\d{1,8}$/;

function webUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url : null;
  } catch { return null; }
}

function cleanRow(row, origin) {
  if (!TYPES.has(row?.type) || webUrl(row.page)?.origin !== origin ||
    !Number.isSafeInteger(row.time) || row.time <= 0 || row.time > 8640000000000000) return null;
  const clean = {type: row.type, page: row.page, time: row.time};
  for (const key of ['name', 'platform', 'source', 'actionId']) {
    if (typeof row[key] === 'string') clean[key] = row[key].slice(0, 256);
  }
  if (row.type === 'event' && typeof row.eventId === 'string' && EVENT_ID.test(row.eventId)) {
    clean.eventId = row.eventId;
  }
  if (Number.isSafeInteger(row.position) && row.position >= 0) clean.position = row.position;
  if (row.element && typeof row.element === 'object') {
    clean.element = Object.fromEntries(['tag','text','selector','region']
      .filter(key => typeof row.element[key] === 'string')
      .map(key => [key, row.element[key].slice(0, 512)]));
  }
  return clean;
}

export function createManualLive(dashboardToken, now = Date.now) {
  const pairing = randomBytes(18).toString('base64url');
  let current;

  function status() {
    if (!current) return 'idle';
    if (current.status === 'completed') return 'completed';
    return now() - current.updated > STALE_MS ? 'interrupted' : current.status;
  }

  return async function handle(req, res, requestUrl, json) {
    if (requestUrl.pathname !== PATH) return false;
    const origin = req.headers.origin;
    if (req.method === 'GET') {
      if (req.headers['x-atlas-token'] !== dashboardToken) json(403, {error: 'forbidden'});
      else if (requestUrl.searchParams.has('detail')) {
        const detail = current && current.id === requestUrl.searchParams.get('id')
          ? current.details.get(requestUrl.searchParams.get('detail')) : undefined;
        if (detail) json(200, {detail});
        else json(404, {error: 'detail'});
      }
      else if (!current) json(200, {pairing, status: 'idle'});
      else {
        const requested = Number(requestUrl.searchParams.get('offset'));
        const offset = requestUrl.searchParams.get('id') === current.id && Number.isSafeInteger(requested)
          ? Math.min(Math.max(requested, 0), current.rows.length) : 0;
        json(200, {pairing, status: status(), id: current.id, root: current.root, offset,
          total: current.rows.length, rows: current.rows.slice(offset, offset + 250)});
      }
      return true;
    }
    if (!isExtension(origin)) {
      json(403, {error: 'forbidden'});
      return true;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, x-atlas-pairing');
      if (req.headers['access-control-request-private-network'] === 'true') {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
      res.writeHead(204).end();
      return true;
    }
    if (req.method !== 'POST' || req.headers['x-atlas-pairing'] !== pairing) {
      json(403, {error: 'pairing'});
      return true;
    }
    let payload;
    try {
      if (Number(req.headers['content-length']) > MAX_BYTES) throw Error('size');
      let size = 0;
      const chunks = [];
      for await (const chunk of req.iterator({destroyOnReturn: false})) {
        size += chunk.length;
        if (size > MAX_BYTES) throw Error('size');
        chunks.push(chunk);
      }
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      req.resume();
      json(error.message === 'size' ? 413 : 400, {error: error.message === 'size' ? 'limit' : 'payload'});
      return true;
    }
    const {id, root, offset, rows, status: nextStatus} = payload || {};
    const url = webUrl(root);
    if (typeof id !== 'string' || !SESSION_ID.test(id) || !url || !STATUSES.has(nextStatus) ||
      !Number.isSafeInteger(offset) || offset < 0 || !Array.isArray(rows) || rows.length > 100) {
      json(400, {error: 'payload'});
      return true;
    }
    if (current?.id !== id && (offset || ['recording','paused'].includes(status()))) {
      json(409, {error: 'busy'});
      return true;
    }
    if (current?.id === id && (current.origin !== origin || current.root !== root)) {
      json(403, {error: 'forbidden'});
      return true;
    }
    const clean = rows.map(row => cleanRow(row, url.origin));
    if (clean.some(row => !row)) {
      json(400, {error: 'payload'});
      return true;
    }
    const stream = current?.id === id ? current : {id, root, origin, rows: [], details: new Map(), detailBytes: 0};
    if (offset > stream.rows.length || (stream.status === 'completed' && offset + rows.length > stream.rows.length)) {
      json(409, {error: 'sequence'});
      return true;
    }
    const skip = stream.rows.length - offset;
    const fresh = clean.slice(skip);
    if (stream.rows.length + fresh.length > MAX_ROWS) {
      json(413, {error: 'limit'});
      return true;
    }
    for (const [index, row] of fresh.entries()) {
      const payload = rows[skip + index].details;
      if (!row.eventId || !payload || typeof payload !== 'object') continue;
      if (!stream.details.has(row.eventId)) {
        const detail = timelineEvidence(payload);
        const size = Buffer.byteLength(JSON.stringify(detail));
        if (stream.detailBytes + size <= MAX_DETAIL_BYTES) {
          stream.details.set(row.eventId, detail);
          stream.detailBytes += size;
        }
      }
      row.detailAvailable = stream.details.has(row.eventId);
    }
    stream.rows.push(...fresh);
    stream.updated = now();
    if (stream.status !== 'completed') stream.status = nextStatus;
    current = stream;
    json(200, {offset: stream.rows.length});
    return true;
  };
}
