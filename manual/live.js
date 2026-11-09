const ENDPOINT = 'http://127.0.0.1:4318/api/manual/live';
const BATCH_SIZE = 20;

export function createLivePublisher(model, root, pairing, onState) {
  const id = crypto.randomUUID();
  let offset = 0;
  let status = 'recording';
  let acknowledged;
  let lastSent = 0;
  let timer;
  let inFlight;

  async function send() {
    const rows = model.delta(offset, BATCH_SIZE);
    if (!rows.length && status === acknowledged && Date.now() - lastSent < 5000) return;
    const requested = status === 'completed' && model.delta(offset + rows.length, 1).length
      ? 'recording' : status;
    const response = await fetch(ENDPOINT, {
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
      headers: {'Content-Type': 'application/json', 'X-Atlas-Pairing': pairing},
      body: JSON.stringify({id, root, offset, rows, status: requested}),
      signal: AbortSignal.timeout(2000)
    });
    if (!response.ok) {
      const reason = response.status === 403 ? 'invalidPairing'
        : response.status === 409 ? 'busy'
        : response.status === 413 ? 'liveLimit' : response.status === 400 ? 'liveRejected' : 'reconnecting';
      throw Error(reason);
    }
    const data = await response.json();
    offset = data.offset;
    acknowledged = requested;
    lastSent = Date.now();
    if (requested === 'completed') close();
    onState(requested === 'completed' ? 'synced' : 'connected');
  }

  function close() {
    clearInterval(timer);
  }

  function flush() {
    if (inFlight) return;
    inFlight = send().catch(error => {
      const reason = ['invalidPairing', 'busy', 'liveLimit', 'liveRejected'].includes(error.message)
        ? error.message : 'reconnecting';
      if (reason !== 'reconnecting') close();
      onState(reason);
    }).finally(() => inFlight = null);
  }

  return {
    async connect() {
      await send();
      timer = setInterval(flush, 500);
    },
    setStatus(value) {
      status = value;
      flush();
    },
    close
  };
}
