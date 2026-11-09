// This function is also serialized into the inspected page. It reads data properties only.
export function snapshotParameters(input, {
  maxBytes = 16384, redact = false, omitEvent = false, maxEntries = 120, maxDepth = 5, exactStrings = false
} = {}) {
  const sensitive = /^(?:password|passwd|passphrase|authorization|proxyauthorization|cookie|setcookie|token|accesstoken|refreshtoken|idtoken|sessiontoken|apikey|clientsecret|secret|credentials)$/i;
  const encoder = new TextEncoder();
  let bytes = maxBytes;
  let remaining = maxEntries;
  let parametersTruncated = false;
  let parametersRedacted = false;

  function charge(text) {
    const size = encoder.encode(text).byteLength;
    if (size > bytes) {
      parametersTruncated = true;
      return false;
    }
    bytes -= size;
    return true;
  }

  function copy(value, depth) {
    if (typeof value === 'string') {
      if (exactStrings && value.length <= bytes - 2) {
        const size = encoder.encode(JSON.stringify(value)).byteLength;
        if (size <= bytes) {
          bytes -= size;
          return value;
        }
      }
      const limit = Math.min(value.length, Math.max(0, Math.floor((bytes - 2) / 6)));
      if (limit < value.length) parametersTruncated = true;
      const clipped = value.slice(0, limit);
      return charge(JSON.stringify(clipped)) ? clipped : undefined;
    }
    if (value === null || typeof value === 'boolean' || Number.isFinite(value)) {
      return charge(JSON.stringify(value)) ? value : undefined;
    }
    if (!value || typeof value !== 'object') return;
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (!array && prototype !== Object.prototype && prototype !== null) return;
    if (depth > maxDepth || !charge('{}')) {
      parametersTruncated = true;
      return;
    }
    const entries = [];
    for (const key of Object.keys(value)) {
      if (depth === 0 && omitEvent && key === 'event') continue;
      if (array && key !== String(entries.length)) {
        parametersTruncated = true;
        break;
      }
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (!property || !('value' in property)) continue;
      if (--remaining < 0 || !charge(array ? ',' : JSON.stringify(key) + ':,')) {
        parametersTruncated = true;
        break;
      }
      let item;
      if (redact && sensitive.test(key.replace(/[^a-z]/gi, ''))) {
        parametersRedacted = true;
        item = copy('[redacted]', depth + 1);
      } else item = copy(property.value, depth + 1);
      if (item !== undefined) entries.push([key, item]);
      else if (array) {
        if (!charge('null')) break;
        entries.push([key, null]);
      }
    }
    return array ? entries.map(([, item]) => item) : Object.fromEntries(entries);
  }

  const parameters = input && typeof input === 'object' ? copy(input, 0) : undefined;
  return {parameters: parameters ?? {}, parametersTruncated, parametersRedacted};
}

export function timelineEvidence(event) {
  const details = snapshotParameters(event.parameters, {maxBytes: 4096, redact: true});
  details.parametersTruncated ||= event.parametersTruncated === true;
  details.parametersRedacted ||= event.parametersRedacted === true;
  for (const key of ['measurementId', 'endpoint', 'reportedPage']) {
    if (typeof event[key] === 'string' && event[key]) details[key] = event[key].slice(0, 1536);
  }
  if (Number.isInteger(event.httpStatus) && event.httpStatus >= 100 && event.httpStatus <= 599) {
    details.httpStatus = event.httpStatus;
  }
  return details;
}
