import {snapshotParameters} from './manual/timeline-evidence.js';

const MAX_DEPTH = 24;
const androidParameters = input => snapshotParameters(input,{
  maxBytes:64 * 1024, maxEntries:2048, maxDepth:MAX_DEPTH, exactStrings:true, redact:true
});

export function logEntry(line) {
  const fields = /^\s*(\d{9,12}\.\d{3,9})\s+(\d+)\s+\d+\s+[VDIWEAF]\s+(FA|FA-SVC|GoogleTagManager|MoEngage|EventAtlas)\s*:\s?(.*)$/.exec(line);
  if (!fields) return null;
  const [, seconds, pid, tag, message] = fields;
  return {pid, tag, message, loggedAt:Math.round(Number(seconds) * 1000)};
}

const bundleKey = /^[A-Za-z0-9_.-]+(?:\([A-Za-z0-9_.-]+\))?=/;

function splitParts(text, startsNext, complete) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i=0;i<text.length;i++) {
    const char = text[i];
    if (char === '[' || char === '{') depth++;
    if ((char === ']' || char === '}') && depth) depth--;
    if (!depth && char === ',' && startsNext(text.slice(i+1).trimStart())) {
      parts.push(text.slice(start,i).trimStart());
      start = i + 1;
    }
  }
  if (complete && text.slice(start).trimStart()) parts.push(text.slice(start).trimStart());
  return parts;
}

function bundle(payload) {
  if (!payload) return {parameters:{}};
  let truncated = false;
  function valueOf(value, depth) {
    if (depth > MAX_DEPTH) {truncated = true; return undefined;}
    if (value.startsWith('Bundle[{')) return readBundle(value,depth);
    if (value.startsWith('[Bundle[{') && value.endsWith(']')) {
      return splitParts(value.slice(1,-1), next => next.startsWith('Bundle[{'), true)
        .map(item => readBundle(item,depth + 1));
    }
    if (/^[\[{]/.test(value)) {
      try {return JSON.parse(value);} catch {truncated = true; return undefined;}
    }
    return value;
  }
  function readBundle(value, depth) {
    if (depth > MAX_DEPTH || !value.startsWith('Bundle[{')) {truncated = true; return {};}
    const complete = value.endsWith('}]');
    truncated ||= !complete;
    const parts = splitParts(value.slice(8,complete ? -2 : undefined), next => bundleKey.test(next), complete);
    return Object.fromEntries(parts.flatMap(part => {
      const label = bundleKey.exec(part)?.[0];
      if (!label) {truncated = true; return [];}
      const parsed = valueOf(part.slice(label.length),depth + 1);
      return parsed === undefined ? [] : [[label.slice(0,-1),parsed]];
    }));
  }
  const preview = androidParameters(readBundle(payload,0));
  preview.parametersTruncated ||= truncated;
  return preview;
}

export function firebaseLog(entry) {
  if (entry?.tag !== 'FA') return null;
  const event = /^Logging event \(FE\):\s*([A-Za-z0-9_]+(?:\([A-Za-z0-9_]+\))?)(?:,\s*(.*))?$/.exec(entry.message);
  if (!event) return null;
  return {name:event[1], platform:'ga4', source:'logcat', evidence:{loggedAt:entry.loggedAt, ...bundle(event[2])}};
}

function jsonAttributes(text) {
  if (!text?.startsWith('{')) return {parameters:{},parametersTruncated:true};
  const pairs = [];
  let depth = 1;
  let start = 1;
  let quoted = false;
  let escaped = false;
  let complete = false;
  let invalid = false;

  function add(end) {
    const property = text.slice(start,end).trim();
    if (!property) return;
    try {
      const parsed = JSON.parse('{' + property + '}');
      pairs.push(...Object.entries(parsed));
    } catch {invalid = true;}
  }

  // Logcat can cut off large records. Only keep members whose JSON was complete.
  for (let i=1; i<text.length; i++) {
    const char = text[i];
    if (escaped) {escaped = false; continue;}
    if (quoted && char === '\\') {escaped = true; continue;}
    if (char === '"') {quoted = !quoted; continue;}
    if (quoted) continue;
    if (char === '}' && depth === 1) {add(i); complete = true; break;}
    if (char === ',' && depth === 1) {add(i); start = i + 1;}
    if (char === '{' || char === '[') depth++;
    if (char === '}' || char === ']') depth--;
  }
  const preview = androidParameters(Object.fromEntries(pairs));
  preview.parametersTruncated ||= !complete || invalid;
  return preview;
}

export function moengageLog(entry) {
  if (entry?.tag !== 'MoEngage') return null;
  // One SDK notification is enough. Skip the same event's storage and upload logs.
  const event = /\bCore_ActionNotifier\s+onEventTracked\(\)\s*:[^\r\n]*?\{\s*eventName\s*=\s*(.{1,160}?),\s*eventAttributes\s*=\s*(\{.*)$/.exec(entry.message);
  const name = event?.[1].trim();
  if (!name) return null;
  return {name,platform:'moengage',source:'moengage-logcat',evidence:{loggedAt:entry.loggedAt,...jsonAttributes(event[2])}};
}
