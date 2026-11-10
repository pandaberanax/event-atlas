import {stripVTControlCharacters} from 'node:util';

export function readableError(error) {
  return stripVTControlCharacters(String(error?.message || error)).split(/\r?\nCall log:/)[0].trim();
}

export async function loadInitialPage(load, reconnect, attempts, signal) {
  for (const protocol of ['default','http1']) {
    const attempt = {protocol,status:'loading'};
    attempts.push(attempt);
    try {
      if (protocol==='http1') await reconnect();
      if (signal?.aborted) throw Error('Audit dihentikan.');
      attempt.httpStatus = await load(protocol);
      attempt.status = 'ok';
      return;
    } catch (error) {
      attempt.status = 'error';
      attempt.error = readableError(error);
      const http2Error = /^page\.goto: net::ERR_HTTP2_PROTOCOL_ERROR\b/.test(attempt.error);
      if (protocol!=='default' || !http2Error || signal?.aborted) throw error;
    }
  }
}

export async function handleRoute(route, handle, onError) {
  let finished = false;
  const terminal = operation => async (...args) => {
    finished = true;
    return route[operation](...args);
  };
  const finish = {abort:terminal('abort'),continue:terminal('continue'),fulfill:terminal('fulfill')};
  try {
    await handle(finish);
  } catch (error) {
    const message = readableError(error);
    if (/Target page, context or browser has been closed|Route is already handled|Invalid InterceptionId|Target closed/i.test(message)) return;
    onError(message);
    // A failed terminal call can already have consumed the route.
    if (!finished) await finish.abort('failed').catch(()=>{});
  }
}
