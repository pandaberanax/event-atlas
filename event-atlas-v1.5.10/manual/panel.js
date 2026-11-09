import {readPage} from './page-observer.js';
import {createRecording} from './report.js';
import {createLivePublisher} from './live.js';
import {snapshotParameters} from './timeline-evidence.js';

const labels = {
  title: ['Rekam manual', 'Manual recording'],
  language: ['Bahasa', 'Language'],
  instructions: ['Mulai rekam, lalu gunakan tab seperti biasa. Muat ulang halaman sendiri jika ingin merekam event pemuatan.', 'Start recording, then use the tab normally. Reload the page yourself to capture load events.'],
  start: ['Mulai rekam', 'Start recording'],
  pause: ['Jeda', 'Pause'],
  resume: ['Lanjutkan', 'Resume'],
  stop: ['Berhenti', 'Stop'],
  download: ['Unduh JSON', 'Download JSON'],
  pages: ['Halaman', 'Pages'],
  clicks: ['Klik', 'Clicks'],
  activities: ['Aktivitas', 'Activities'],
  events: ['Observasi event', 'Event observations'],
  mode: ['Mode rekaman', 'Recording mode'],
  liveMode: ['Real-time ke dashboard', 'Live to dashboard'],
  jsonMode: ['Rekam ke JSON', 'Record to JSON'],
  pairing: ['Kode koneksi', 'Pairing code'],
  pairingHelp: ['Salin kode dari Activity Timeline di dashboard lokal.', 'Copy the code from Activity Timeline in the local dashboard.'],
  dashboard: ['Buka dashboard ↗', 'Open dashboard ↗'],
  note: ['Biarkan DevTools terbuka. Rekaman berlaku untuk satu tab di origin awal. Unduh JSON sebelum menutup sesi jika ingin menyimpan salinan.', 'Keep DevTools open. Recording covers one tab on the starting origin. Download JSON before closing the session if you want to keep a copy.'],
  idle: ['Siap merekam tab ini.', 'Ready to record this tab.'],
  starting: ['Membuka sesi…', 'Starting session…'],
  recording: ['Sedang merekam.', 'Recording.'],
  pausing: ['Menjeda rekaman…', 'Pausing recording…'],
  paused: ['Rekaman dijeda.', 'Recording paused.'],
  resuming: ['Melanjutkan rekaman…', 'Resuming recording…'],
  stopping: ['Menyelesaikan rekaman…', 'Finishing recording…'],
  stopped: ['Rekaman selesai.', 'Recording finished.'],
  left: ['Tab meninggalkan origin awal. Rekaman selesai.', 'The tab left the starting origin. Recording finished.'],
  pairingRequired: ['Masukkan kode koneksi dari dashboard lokal.', 'Enter the pairing code from the local dashboard.'],
  invalidPairing: ['Kode ditolak. Salin kode terbaru dari Activity Timeline.', 'Code rejected. Copy the current code from Activity Timeline.'],
  busy: ['Dashboard sedang menerima sesi lain. Hentikan sesi itu atau pilih mode JSON.', 'The dashboard is receiving another session. Stop it or choose JSON mode.'],
  reconnecting: ['Menyambungkan ulang ke dashboard…', 'Reconnecting to dashboard…'],
  unreachable: ['Dashboard lokal tidak terjangkau. Buka Event Atlas atau pilih mode JSON.', 'The local dashboard is unavailable. Open Event Atlas or choose JSON mode.'],
  liveLimit: ['Batas timeline tercapai. Simpan hasil lengkap dengan Unduh JSON.', 'Timeline limit reached. Use Download JSON to save the full result.'],
  liveRejected: ['Dashboard menolak aktivitas ini. Hasil tersedia di JSON setelah rekaman selesai.', 'The dashboard rejected this activity. The result is available as JSON when recording ends.'],
  connected: ['Dashboard terhubung', 'Dashboard connected'],
  synced: ['Tersinkron ke dashboard', 'Synced to dashboard'],
  unavailable: ['Halaman belum bisa dibaca. Buka halaman HTTP(S) di tab ini, lalu coba lagi.', 'The page is unavailable. Open an HTTP(S) page in this tab and try again.']
};
const $ = id => document.getElementById(id);
const api = chrome.devtools;
const key = '__eventAtlasManual_' + crypto.randomUUID();
let status = 'idle';
let session;
let result;
let linkState;

function render() {
  const language = $('language').value;
  const translate = name => labels[name][language === 'en' ? 1 : 0];
  document.documentElement.lang = language;
  document.body.dataset.status = status;
  document.querySelectorAll('[data-label]').forEach(node => {
    const value = translate(node.dataset.label);
    if (node.textContent !== value) node.textContent = value;
  });
  const busy = !!session || status === 'starting';
  if ($('status').textContent !== translate(status)) $('status').textContent = translate(status);
  $('start').disabled = busy;
  $('mode').disabled = busy;
  $('pairing').disabled = busy;
  $('pairingField').hidden = $('pairingHelp').hidden = $('mode').value !== 'live';
  $('pause').disabled = $('stop').disabled = !['recording','paused'].includes(status);
  $('pause').textContent = translate(status === 'paused' ? 'resume' : 'pause');
  $('connection').hidden = !linkState;
  const connection = linkState ? translate(linkState) : '';
  if ($('connection').textContent !== connection) $('connection').textContent = connection;
  $('download').disabled = !result;
  $('page').textContent = session?.page || result?.pages.at(-1)?.url || '';
  const counts = session?.model.counts() || {pages: result?.summary.visited || 0,
    clicks: result?.summary.testedElements || 0, events: result?.summary.observations || 0,
    activities: result ? result.timeline.length - result.events.length : 0};
  for (const [id, count] of Object.entries(counts)) $(id).textContent = count;
}

function inspect(expression) {
  return new Promise(resolve => api.inspectedWindow.eval(expression, (value, error) =>
    resolve(error?.isException || error?.isError ? undefined : value)));
}

function inspectPage(current, operation) {
  return inspect('(' + readPage.toString() + ')(...' + JSON.stringify([key, current.origin, operation]) +
    ',(' + snapshotParameters.toString() + '))');
}

async function poll(current) {
  if (current.inFlight) return current.inFlight;
  current.inFlight = (async () => {
    const snapshot = await inspectPage(current, 'read');
    if (session !== current) return;
    if (snapshot) {
      if (!current.cutoff) current.page = snapshot.page;
      current.model.read(snapshot, current.cutoff);
    }
    for (const har of current.requests.splice(0)) current.model.network(har);
    render();
  })();
  try { await current.inFlight; } finally { current.inFlight = null; }
}

async function stop(reason = 'stopped') {
  if (!['recording','paused'].includes(status)) return;
  const current = session;
  const wasRecording = status === 'recording';
  current.cutoff = Date.now();
  status = 'stopping';
  clearInterval(current.timer);
  render();
  await current.inFlight;
  if (wasRecording && reason !== 'left') await poll(current);
  for (const har of current.requests.splice(0)) current.model.network(har);
  if (reason !== 'left') await inspectPage(current, 'remove');
  result = current.model.report();
  current.publisher?.setStatus('completed');
  session = null;
  status = reason;
  render();
}

function schedule(current) {
  current.timer = setInterval(() => poll(current), 400);
}

async function pauseOrResume() {
  const current = session;
  if (status === 'recording') {
    status = 'pausing';
    current.cutoff = Date.now();
    clearInterval(current.timer);
    render();
    await current.inFlight;
    await poll(current);
    await inspectPage(current, 'remove');
    current.model.pause(current.cutoff);
    current.publisher?.setStatus('paused');
    status = 'paused';
  } else if (status === 'paused') {
    status = 'resuming';
    render();
    const snapshot = await inspectPage(current, 'start');
    if (!snapshot || !current.model.resume(snapshot.page, snapshot.time)) {
      status = 'paused';
      await stop('left');
      return;
    }
    current.cutoff = undefined;
    current.page = snapshot.page;
    current.model.read(snapshot);
    current.publisher?.setStatus('recording');
    status = 'recording';
    schedule(current);
  }
  render();
}

let lastPublisher;
$('start').onclick = async () => {
  const pairing = $('pairing').value.trim();
  const live = $('mode').value === 'live';
  if (live && !pairing) {
    status = 'pairingRequired';
    render();
    $('pairing').focus();
    return;
  }
  lastPublisher?.close();
  linkState = undefined;
  status = 'starting';
  render();
  const page = await inspect('location.href');
  if (typeof page !== 'string' || !/^https?:\/\//.test(page)) {
    status = 'unavailable';
    render();
    return;
  }
  const current = {model: createRecording(page, chrome.runtime.getManifest().version),
    origin: new URL(page).origin, page, requests: []};
  session = current;
  if (live) {
    current.publisher = lastPublisher = createLivePublisher(current.model, page, pairing, state => {
      if (lastPublisher !== current.publisher) return;
      linkState = state;
      render();
    });
    try {
      await current.publisher.connect();
    } catch (error) {
      status = ['invalidPairing','busy','liveLimit','liveRejected'].includes(error.message) ? error.message : 'unreachable';
      session = null;
      render();
      return;
    }
  }
  const snapshot = await inspectPage(current, 'start');
  if (!snapshot) {
    current.publisher?.setStatus('completed');
    session = null;
    status = 'unavailable';
    render();
    return;
  }
  current.model.read(snapshot);
  result = null;
  status = 'recording';
  schedule(current);
  render();
};

api.network.onNavigated.addListener(url => {
  if (status === 'paused' && !url.startsWith(session.origin + '/')) {
    void stop('left');
    return;
  }
  if (status !== 'recording') return;
  if (!session.model.navigate(url)) {
    void stop('left');
    return;
  }
  session.page = url;
  void poll(session);
});

api.network.onRequestFinished.addListener(har => {
  if (session && (status === 'recording' || status === 'starting')) session.requests.push(har);
});

$('stop').onclick = () => stop();
$('pause').onclick = pauseOrResume;
$('download').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'event-atlas-' + result.id + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('language').onchange = render;
$('mode').onchange = render;
$('version').textContent = 'v' + chrome.runtime.getManifest().version;
render();
