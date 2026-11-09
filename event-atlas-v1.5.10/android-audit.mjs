import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import {createAdb, androidError, androidProperties, packagePattern} from './android-adb.mjs';
import {logEntry, firebaseLog, moengageLog} from './android-log.mjs';
import {VERSION} from './dist/release.js';

const MAX_ROWS = 5000;
const MAX_BYTES = 24 * 1024 * 1024;
const TAP_WINDOW = 8000;
const diagnosticPlatforms = new Map([
  ['FA','ga4'], ['FA-SVC','ga4'], ['GoogleTagManager','gtm'], ['MoEngage','moengage']
]);

export function createAndroidAudit(adb = createAdb()) {
  let current;
  let starting;

  function state(session = current) {
    if (!session) return {status:'idle'};
    const {id, packageName, startedAt, finishedAt, status, issue, warning, eventCount, diagnosticCount, firebaseDebug, diagnostics} = session;
    return {id, packageName, startedAt, finishedAt, status, issue, warning, eventCount, diagnosticCount,
      firebaseDebug, diagnostics, markerCount:session.rows.length-eventCount-diagnosticCount};
  }

  async function restore(session) {
    const results = await Promise.allSettled(session.propertyChanges.map(async ({property,original,value}) => {
      if (await adb.getProperty(session.device,property) === value) {
        await adb.setProperty(session.device,property,original);
      }
    }));
    if (results.some(result => result.status === 'rejected')) session.warning = 'androidRestoreFailed';
  }

  async function configure(session) {
    const properties = [[androidProperties.firebaseLog,'VERBOSE']];
    if (session.firebaseDebug) properties.push([androidProperties.firebaseDebug,session.packageName]);
    if (session.diagnostics) properties.push(
      [androidProperties.firebaseServiceLog,'VERBOSE'], [androidProperties.tagManagerLog,'VERBOSE']);
    const results = await Promise.allSettled(properties.map(async ([property,value]) => {
      const original = await adb.getProperty(session.device,property);
      if (original === value) return;
      session.propertyChanges.push({property,original,value});
      await adb.setProperty(session.device,property,value);
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }

  function finish(session, status, issue) {
    if (session.finishing) return session.finishing;
    session.status = 'stopping';
    session.finishedAt = Date.now();
    clearInterval(session.watcher);
    session.reader?.close();
    session.stream?.kill();
    session.finishing = restore(session).finally(() => {
      session.status = status;
      session.issue = issue;
    });
    return session.finishing;
  }

  function append(session, row) {
    const bytes = Buffer.byteLength(JSON.stringify(row));
    if (session.bytes + bytes > MAX_BYTES) {
      void finish(session,'completed','androidByteLimit');
      return;
    }
    session.bytes += bytes;
    session.rows.push(row);
    if (row.type === 'event') session.eventCount++;
    if (row.type === 'diagnostic') session.diagnosticCount++;
    if (session.rows.length >= MAX_ROWS) void finish(session,'completed','androidRowLimit');
  }

  function observe(session, entry) {
    if (session.status !== 'recording' || entry.pid !== session.pid || entry.loggedAt < session.boundary) return;
    const event = firebaseLog(entry) || moengageLog(entry);
    const time = Date.now();
    if (!event) {
      const platform = diagnosticPlatforms.get(entry.tag);
      if (session.diagnostics && platform) append(session,{type:'diagnostic',time,screen:session.screen,
        name:entry.tag,platform,source:'android-diagnostic',evidence:{loggedAt:entry.loggedAt,logMessage:entry.message}});
      return;
    }
    if (session.diagnostics) event.evidence.logMessage = entry.message;
    const marker = session.tap && time - session.tap.time <= TAP_WINDOW ? session.tap : undefined;
    const params = event.evidence.parameters;
    const sdkScreen = params.firebase_screen || params['firebase_screen(_sn)'] ||
      params['ga_screen(_sn)'] || params._sn || params.firebase_screen_class ||
      params['firebase_screen_class(_sc)'] || params['ga_screen_class(_sc)'] || params._sc;
    append(session,{type:'event',time,screen:session.screen || sdkScreen || '',
      element:marker?.element, ...event});
  }

  async function openStream(session) {
    const marker = 'start-' + randomUUID();
    session.stream = await adb.stream(session.device,session.diagnostics);
    session.stream.stderr?.resume();
    session.reader = createInterface({input:session.stream.stdout,crlfDelay:Infinity});
    const fail = () => {
      session.streamFailed = true;
      if (session.status === 'recording') void finish(session,'interrupted','androidStreamEnded');
    };
    session.stream.once('error',fail);
    session.stream.once('exit',fail);
    session.reader.on('line',line => {
      const entry = logEntry(line);
      if (!entry) return;
      if (entry.tag === 'EventAtlas' && entry.message === marker) session.boundary ??= entry.loggedAt;
      else if (session.boundary) observe(session,entry);
    });
    // A unique marker separates this session from the device's existing Logcat buffer.
    for (let attempt=0; attempt<12 && !session.streamFailed; attempt++) {
      await adb.writeMarker(session.device,marker);
      if (session.boundary) return;
      await delay(180);
      if (session.boundary && !session.streamFailed) return;
    }
    throw androidError('androidLogcatFailed',502);
  }

  function watch(session) {
    let checking = false;
    session.watcher = setInterval(async () => {
      if (checking || session.status !== 'recording') return;
      checking = true;
      try {
        const pid = await adb.pid(session.device,session.packageName);
        if (session.status === 'recording' && pid !== session.pid) {
          void finish(session,'interrupted','androidAppEnded');
        }
      } catch {
        if (session.status === 'recording') void finish(session,'interrupted','androidStreamEnded');
      } finally { checking = false; }
    },2000);
    session.watcher.unref();
  }

  async function begin({device, packageName, firebaseDebug, diagnostics}) {
    if (typeof packageName !== 'string' || packageName.length > 240 || !packagePattern.test(packageName)) {
      throw androidError('androidPackageRequired');
    }
    const known = (await adb.devices()).find(item => item.serial === device && item.state === 'device');
    if (!known) throw androidError('androidDeviceRequired');
    const pid = await adb.pid(device,packageName);
    if (!pid) throw androidError('androidOpenApp');
    const session = {id:randomUUID(),status:'starting',device,packageName,pid,rows:[],bytes:0,eventCount:0,diagnosticCount:0,
      firebaseDebug:firebaseDebug === true, diagnostics:diagnostics === true, propertyChanges:[]};
    try {
      await configure(session);
      await openStream(session);
      if (session.streamFailed) throw androidError('androidLogcatFailed',502);
      session.startedAt = Date.now();
      session.status = 'recording';
      current = session;
      watch(session);
      return state(session);
    } catch (error) {
      await finish(session,'interrupted');
      if (session.warning) throw androidError(session.warning,502);
      throw error;
    }
  }

  async function start(body) {
    if (starting || ['recording','stopping'].includes(current?.status)) throw androidError('androidBusy',409);
    starting = begin(body);
    try {return await starting;} finally {starting = undefined;}
  }

  function mark({type,label,id}) {
    if (current?.status !== 'recording' || current.id !== id) throw androidError('androidSessionEnded',409);
    if (!['screen','tap'].includes(type) || typeof label !== 'string' || !label.trim() || label.length > 160) {
      throw androidError('androidLabelRequired');
    }
    const text = label.trim();
    const time = Date.now();
    if (type === 'screen') {
      current.screen = text;
      current.tap = undefined;
      append(current,{type,time,screen:text});
    } else {
      const element = {text};
      current.tap = {time,element};
      append(current,{type,time,screen:current.screen,element});
    }
  }

  async function stop(id) {
    if (!current || current.id !== id) throw androidError('androidSessionEnded',409);
    if (current.status === 'recording') await finish(current,'completed');
    else await current.finishing;
    return state();
  }

  function view(id, offset) {
    if (!current) return state();
    const start = current.id === id && Number.isSafeInteger(offset)
      ? Math.min(Math.max(offset,0),current.rows.length) : 0;
    return {...state(),total:current.rows.length,rows:current.rows.slice(start,start+100)};
  }

  function report() {
    if (!current) throw androidError('androidSessionEnded',404);
    return {schemaVersion:1,mode:'android',appVersion:VERSION,...state(),rows:current.rows};
  }

  return {devices:adb.devices, packages:adb.packages, start, mark, stop, view, report,
    async shutdown() {
      await starting?.catch(() => {});
      if (current?.status === 'recording') await finish(current,'interrupted','androidStreamEnded');
      else await current?.finishing;
    }};
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({destroyOnReturn:false})) {
    size += chunk.length;
    if (size > 16384) {req.resume(); throw androidError('androidInvalidRequest',413);}
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || typeof body !== 'object') throw androidError('androidInvalidRequest');
  return body;
}

export async function handleAndroid(audit, req, url, json) {
  const endpoint = url.pathname.slice('/api/android/'.length);
  try {
    if (req.method === 'GET') {
      if (endpoint === 'devices') return json(200,{devices:await audit.devices()});
      if (endpoint === 'packages') return json(200,{packages:await audit.packages(url.searchParams.get('device'))});
      if (endpoint === 'session') return json(200,audit.view(url.searchParams.get('id'),Number(url.searchParams.get('offset'))));
      if (endpoint === 'export') return json(200,audit.report());
    }
    if (req.method === 'POST') {
      if (endpoint === 'start') return json(200,await audit.start(await readBody(req)));
      if (endpoint === 'stop') return json(200,await audit.stop((await readBody(req)).id));
      if (endpoint === 'mark') {audit.mark(await readBody(req)); return json(200,{ok:true});}
    }
    json(404,{error:'androidInvalidRequest'});
  } catch (error) {
    json(error.status || 400,{error:error.status ? error.message : 'androidInvalidRequest'});
  }
}
