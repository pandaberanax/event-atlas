import {t} from './i18n.js';

const $ = id => document.getElementById(id);

export function createAndroidControls({token, onChange}) {
  let feed = {status:'idle', rows:[], android:true};
  let busy = false;
  let generation = 0;
  let notice;
  const device = $('androidDevice');
  const packageName = $('androidPackage');
  const firebaseDebug = $('androidFirebaseDebug');
  const diagnostics = $('androidDiagnostics');
  const markForm = $('androidMarkForm');

  async function request(endpoint, body) {
    if (!token()) throw Error('androidForbidden');
    const response = await fetch('/api/android/' + endpoint, {
      method:body ? 'POST' : 'GET',
      headers:{'X-Atlas-Token':token(), ...(body && {'Content-Type':'application/json'})},
      body:body && JSON.stringify(body), cache:'no-store',
      signal:AbortSignal.timeout(body ? 30000 : 7000)
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'androidAdbFailed');
    return data;
  }

  function render() {
    const active = ['recording','stopping'].includes(feed.status);
    const locked = busy || active || !token();
    device.disabled = locked;
    packageName.disabled = locked;
    firebaseDebug.disabled = locked;
    diagnostics.disabled = locked;
    if (active) {
      firebaseDebug.checked = feed.firebaseDebug === true;
      diagnostics.checked = feed.diagnostics === true;
    }
    $('androidRefresh').disabled = locked;
    $('androidStart').disabled = locked || !device.value || !packageName.value;
    $('androidStop').disabled = busy || feed.status !== 'recording';
    $('androidExport').disabled = busy || !feed.id;
    $('androidCounts').hidden = !feed.id;
    $('androidCounts').textContent = t('androidCounts',{
      events:feed.eventCount ?? 0,markers:feed.markerCount ?? 0,diagnostics:feed.diagnosticCount ?? 0
    });
    $('androidWaiting').hidden = feed.status !== 'recording' || (feed.eventCount ?? 0) > 0;
    markForm.hidden = feed.status !== 'recording';
    for (const field of markForm.elements) field.disabled = busy || feed.status !== 'recording';
    const messages = [notice, feed.issue, feed.warning].filter(Boolean).map(key => t(key));
    $('androidNotice').textContent = messages.join(' ');
    $('androidNotice').hidden = !messages.length;
  }

  async function perform(task) {
    if (busy) return;
    generation++;
    busy = true;
    notice = undefined;
    render();
    try {await task();}
    catch (error) {notice = /^android[A-Za-z]+$/.test(error.message) ? error.message : 'androidAdbFailed';}
    finally {busy = false; render();}
  }

  function placeholder(key) {
    const option = new Option(t(key),'');
    option.dataset.i18n = key;
    return option;
  }
  async function loadPackages(preferred) {
    packageName.replaceChildren(placeholder('androidChoosePackage'));
    if (!device.value) return;
    const data = await request('packages?' + new URLSearchParams({device:device.value}));
    for (const name of data.packages) packageName.add(new Option(name,name));
    if (data.packages.includes(preferred)) packageName.value = preferred;
    else if (data.packages.length === 1) packageName.value = data.packages[0];
    if (!data.packages.length) notice = 'androidNoPackages';
  }

  $('androidRefresh').onclick = () => perform(async () => {
    const previousDevice = device.value;
    const previousPackage = packageName.value;
    const devices = (await request('devices')).devices;
    device.replaceChildren(placeholder('androidChooseDevice'));
    const available = devices.filter(item => item.state === 'device');
    for (const item of available) device.add(new Option(item.model ? item.model + ' · ' + item.serial : item.serial,item.serial));
    if (available.some(item => item.serial === previousDevice)) device.value = previousDevice;
    else if (available.length === 1) device.value = available[0].serial;
    await loadPackages(previousPackage);
    if (!available.length) notice = devices.some(item => item.state === 'unauthorized') ? 'androidUnauthorized' : 'androidNoDevices';
  });
  device.onchange = () => perform(loadPackages);
  packageName.onchange = render;

  function update(data) {
    const rows = data.id === feed.id ? feed.rows : [];
    rows.push(...(data.rows || []));
    feed = {...data, rows, android:true, root:data.packageName || ''};
    onChange();
  }

  $('androidStart').onclick = () => perform(async () => {
    update(await request('start',{
      device:device.value,packageName:packageName.value,firebaseDebug:firebaseDebug.checked,diagnostics:diagnostics.checked
    }));
  });
  $('androidStop').onclick = () => perform(async () => {
    update(await request('stop',{id:feed.id}));
  });
  markForm.onsubmit = event => {
    event.preventDefault();
    void perform(async () => {
      await request('mark',{id:feed.id,type:$('androidMarkType').value,label:$('androidMarkLabel').value});
      $('androidMarkLabel').value = '';
    });
  };
  $('androidExport').onclick = () => perform(async () => {
    const report = await request('export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'event-atlas-android-' + report.packageName + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  });

  return {
    render,
    feed:() => feed,
    async refresh() {
      if (busy) return 650;
      const started = generation;
      try {
        const data = await request('session?' + new URLSearchParams({id:feed.id || '',offset:feed.rows.length}));
        if (started !== generation) return 650;
        if (data.id !== feed.id || data.status !== feed.status || data.rows?.length) update(data);
        return feed.rows.length < data.total ? 40 : 650;
      } catch {
        if (started === generation && feed.status !== 'offline') update({id:feed.id,packageName:feed.packageName,status:'offline'});
        return 1500;
      }
    }
  };
}

export function importAndroid(report) {
  const validTypes = ['screen','tap','event','diagnostic'];
  if (report.schemaVersion !== 1 || typeof report.packageName !== 'string' || !Array.isArray(report.rows) ||
    report.rows.length > 5000 || report.rows.some(row => !validTypes.includes(row?.type) ||
      !Number.isSafeInteger(row.time) || row.time <= 0 || row.time > 8640000000000000)) {
    throw Error(t('invalidReport'));
  }
  return {android:true, rows:report.rows, status:'imported', root:report.packageName};
}
