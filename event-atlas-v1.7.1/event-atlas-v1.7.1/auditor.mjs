import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {VERSION,SPEED_PROFILES} from './dist/release.js';
import {elapsedMs,pageIssues} from './dist/model.js';
import {selectedPlatforms,eventPlatform,uniqueEvents} from './dist/platforms.js';
import {parseCollect} from './manual/network-events.js';
import {parseVendorEvents,recognizedEventEndpoint,knownEmptyPayload} from './vendor-network.mjs';
import {instrumentVendors} from './vendor-instrument.mjs';
import {auditScope,pageKey} from './dist/scope.js';
import {instrumentSinglePage} from './scope-instrument.mjs';
import {auditTriggers} from './dist/triggers.js';
import {inspectActions, impressionTargets, inspectVisibility, instrumentGuardedProbe, instrumentActionInspector} from './probe-instrument.mjs';
import {instrumentActivity,pageSignature} from './activity-instrument.mjs';
import {classifyEvent} from './dist/event-model.js';
import {staticAssetCache} from './asset-cache.mjs';
import {createRuntime,indexEvent,updatePage,currentSummary} from './report-runtime.mjs';
import {validateResume,pageComplete} from './checkpoint.mjs';
import {loadInitialPage,handleRoute,readableError} from './navigation.mjs';
import {detectAccessIssue} from './manual/page-access.js';

export function normalizeUrl(value, base, exact=false) {
  try {
    const u = new URL(value, base);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    if(!exact){u.hash = '';
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|gclid|fbclid|_ga|_gl)/i.test(key)) u.searchParams.delete(key);
    u.searchParams.sort();}
    if (/\.(pdf|zip|jpe?g|png|webp|gif|svg|mp[34]|xlsx?|docx?|woff2?|css|js|xml)$/i.test(u.pathname)) return null;
    return u.href;
  } catch { return null; }
}

export {parseCollect};

export async function loadBrowser() {
  let pw;
  try { pw = await import('playwright'); }
  catch (err) {
    if (!process.env.EVENT_ATLAS_MODULES) throw new Error('Playwright belum tersedia. Jalankan npm install terlebih dahulu.');
    pw = createRequire(path.join(process.env.EVENT_ATLAS_MODULES, '_resolver.cjs'))('playwright');
  }
  return pw.chromium;
}

// Runs before page scripts. Observe the real queue without replacing gtag or GTM.
function instrument(platforms) {
  const describe = el => {
    if (!(el instanceof Element)) return null;
    const parts = []; let e = el;
    while (e && parts.length < 8) {
      if (e.id) { parts.unshift('#' + CSS.escape(e.id)); break; }
      const siblings = e.parentElement ? [...e.parentElement.children].filter(x => x.tagName === e.tagName) : [];
      parts.unshift(e.tagName.toLowerCase() + (siblings.length > 1 ? ':nth-of-type(' + (siblings.indexOf(e) + 1) + ')' : ''));
      e = e.parentElement;
    }
    const section = el.closest('header,nav,footer,main,section,aside,[role="dialog"]');
    return { selector: parts.join(' > '), text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 180), tag: el.tagName.toLowerCase(), href: el.getAttribute('href') || '', region: section?.getAttribute('aria-label') || section?.id || section?.tagName.toLowerCase() || 'halaman' };
  };
  window.__atlasDescribe = describe;
  window.__atlasAction = null;
  document.addEventListener('click', e => {
    window.__atlasLastClick = { element: describe(e.target.closest('a,button,[role="button"],input') || e.target), time: Date.now() };
  }, true);
  document.addEventListener('submit', event => {
    event.preventDefault();
    if (window.__atlasGuardedProbe === 'form_submit') {
      window.__atlasRecord({source:'submit-attempt'}).catch(() => {});
    } else {
      event.stopImmediatePropagation();
    }
  }, true);
  const send = data => {
    try { window.__atlasRecord({ ...data, interaction:window.__atlasInteraction?.()||null, frameUrl: location.href, time: Date.now() }).catch(() => {}); } catch {}
  };
  const watched = new WeakSet();
  const watch = (queue, layer) => {
    if (!Array.isArray(queue) || watched.has(queue)) return queue;
    watched.add(queue);
    const consume = item => {
      try {
        const args = Array.isArray(item) || Object.prototype.toString.call(item) === '[object Arguments]' ? Array.from(item) : null;
        if (platforms.includes('ga4') && args?.[0] === 'event' && typeof args[1] === 'string') send({ platform:'ga4', source: 'gtag', name: args[1], parameters: JSON.parse(JSON.stringify(args[2] || {})), layer });
        else if (platforms.includes('ga4') && args?.[0] === 'config') send({ platform:'ga4', source: 'config', name: String(args[1]), layer });
        else if (item && typeof item === 'object' && typeof item.event === 'string' && !/^gtm\./.test(item.event)) {
          const parameters = {};
          for (const [k, v] of Object.entries(item)) if (k !== 'event' && !k.startsWith('gtm.') && ['string','number','boolean'].includes(typeof v)) parameters[k] = v;
          if(platforms.includes('dataLayer'))send({ platform:'dataLayer', source: 'dataLayer', name: item.event, parameters, layer });
        }
      } catch {}
    };
    queue.forEach(consume);
    let original = queue.push, pushing = 0;
    const wrap = fn => function(...items) {
      if (pushing === 0) items.forEach(consume);
      pushing++;
      try { return Reflect.apply(fn, this, items); } finally { pushing--; }
    };
    let wrapped = wrap(original);
    try { Object.defineProperty(queue, 'push', { configurable: true, get: () => wrapped, set(fn) { original = fn; wrapped = wrap(fn); } }); } catch {}
    return queue;
  };
  const names = new Set(['dataLayer']);
  const install = name => {
    let value = window[name] || [];
    watch(value, name);
    try { Object.defineProperty(window, name, { configurable: true, get: () => value, set(next) { value = watch(next, name); } }); } catch {}
  };
  if(!platforms.includes('ga4')&&!platforms.includes('dataLayer'))return;
  install('dataLayer');
  const findLayers = () => document.querySelectorAll('script[src]').forEach(s => {
    try { const name = new URL(s.src).searchParams.get('l'); if (name && !names.has(name)) { names.add(name); install(name); } } catch {}
  });
  new MutationObserver(findLayers).observe(document, {childList: true, subtree: true});
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const iso = () => new Date().toISOString();
function logoutUrl(url) {
  const target = new URL(url);
  const pattern = /(?:^|[^a-z])(?:log[ _-]?out|sign[ _-]?out|keluar)(?:[^a-z]|$)/i;
  let pathname = target.pathname;
  try { pathname = decodeURIComponent(pathname); } catch {}
  return pattern.test(pathname) ||
    ['action','do'].some(key => pattern.test(target.searchParams.get(key)||''));
}

export async function audit(options = {}, onUpdate = () => {}, signal) {
  const previous=options.resume?validateResume(options.resume):null;
  const supplied=options;
  options={...(previous?.options||{}),...options,url:options.url||previous?.root};
  if(previous){options.platforms=previous.options.platforms||['ga4','dataLayer'];options.scope=previous.options.scope||'site';options.maxElements=previous.options.maxElements;options.consent=previous.options.consent||'unchanged';if(supplied.speed&&supplied.speed!==previous.options.speed){options.waitMs=supplied.waitMs;options.concurrency=supplied.concurrency;}}
  const scope=auditScope(options.scope);
  const root = normalizeUrl(options.url,undefined,scope==='single');
  if (!root) throw new Error('Masukkan URL http/https yang valid.');
  const platforms=selectedPlatforms(options.platforms);
  const triggers=auditTriggers(previous ? previous.options.triggers : options.triggers);
  const enabled=new Set(triggers);
  const guardedProbes=enabled.has('outbound')||enabled.has('form_submit');
  const origin = new URL(root).origin;
  const maxPages = scope==='single'?1:Math.max(1, Math.min(10000, Number(options.maxPages) || 100));
  const maxElements = Number.isFinite(Number(options.maxElements ?? 12)) ? Math.max(0, Math.min(200, Number(options.maxElements ?? 12))) : 12;
  const speed=Object.hasOwn(SPEED_PROFILES,options.speed)?options.speed:'balanced';
  const profile=SPEED_PROFILES[speed];
  const waitMs = Math.max(500, Math.min(10000, Number(options.waitMs) || profile.waitMs));
  const concurrency=scope==='single'?1:Math.max(1,Math.min(4,Math.floor(Number(options.concurrency)||profile.concurrency)));
  const navigationTimeoutMs=Math.max(1000,Math.min(120000,Number(options.navigationTimeoutMs)||30000));
  const report = { schemaVersion: 1, appVersion:VERSION, revision:0, id: String(Date.now()), root, startedAt: iso(), finishedAt: null, durationMs:0, status: 'running', options: {maxPages, maxElements, waitMs, concurrency, speed, platforms, consent: options.consent || 'unchanged'}, pages: [], events: [], discovery: {urls: [], sitemaps: [], errors: []}, summary: {}, limitations: ['Mencakup URL publik yang ditemukan di sitemap dan link internal dalam origin yang sama; halaman tanpa link, login, iframe lintas origin, dan alur multi-langkah bisa belum tercakup.', 'Request analitik yang dikenali ditahan sebelum terkirim. Bukti network bukan konfirmasi penerimaan oleh platform.', 'Pemanggilan SDK dan dataLayer belum menjamin pengiriman event. SDK dalam modul privat, endpoint proxy, payload tidak dikenal, atau data terenkripsi dapat tidak terdeteksi.', 'Pemetaan tombol berdasarkan jendela waktu interaksi, bukan bukti sebab-akibat. Event asinkron bisa terkait ke aksi yang berdekatan.', 'Form tidak diisi/dikirim; tombol submit, transaksi, dan tindakan sensitif dilewati. Blocking request dan consent dapat mengubah perilaku situs.', 'Event dalam batch jaringan dipetakan ke waktu request dikirim, yang bisa berbeda dari waktu pemicu aslinya.'] };
  if(speed==='fast')report.limitations.push('Mode Cepat memakai waktu tunggu lebih pendek; event yang terlambat dapat terlewat.');
  const queued = new Set(); const visited = new Set(); const queue = [];
  report.options.scope=scope;
  report.options.navigationTimeoutMs=navigationTimeoutMs;
  report.options.triggers=triggers;
  report.options.triggerTargets=previous ? previous.options.triggerTargets === true : supplied.triggers !== undefined;
  if (guardedProbes) {
    report.limitations[4] = 'Uji form memakai keadaan awal halaman. Pengisian form dan verifikasi submit berhasil perlu uji manual.';
    report.limitations.push('Uji link keluar dan submit menahan navigasi dan request selama aksi. WebSocket dinonaktifkan pada audit ini. Submit berhasil, login, dan logout perlu uji manual.');
  }
  if (enabled.has('impression') && report.options.triggerTargets) {
    report.limitations.push('Uji impression mencoba hingga enam elemen bertanda di bawah viewport, lalu melakukan scroll umum. Hubungan event dan elemen mengikuti waktu uji.');
  }
  report.options.resetPolicy=options.resetPolicy==='smart'?'smart':'isolated';
  report.options.assetCache=options.assetCache!==false;
  report.performance={loads:0,reusedClicks:0,cacheHits:0,assetFetches:0,cacheBytesSaved:0,navigationMs:0,observationMs:0,clickMs:0};
  if(report.options.resetPolicy==='smart')report.limitations.push('Pemakaian ulang halaman bersifat eksperimental: keadaan JavaScript tersembunyi tidak seluruhnya dapat dibandingkan. Setiap klik mencatat mode isolasinya.');
  if(previous){
    if(normalizeUrl(previous.root,undefined,scope==='single')!==root)throw Error('URL resume harus sama dengan laporan asal.');
    const complete=previous.pages.filter(pageComplete);const completeUrls=new Set(complete.map(p=>p.url));
    report.pages=structuredClone(complete);for(const p of report.pages)p.revision=0;report.events=structuredClone(previous.events.filter(e=>completeUrls.has(e.page)));
    for(const e of report.events)e.provenanceVersion||=previous.appVersion||'1.0.0';
    report.startedAt=previous.startedAt;report.sessionStartedAt=iso();report.previousDurationMs=Number(previous.durationMs)||elapsedMs(previous,Date.parse(previous.finishedAt||previous.checkpoint?.savedAt||iso()));
    report.resumedFrom={id:previous.id,appVersion:previous.appVersion||'1.0.0',completedPages:complete.length,repeatedPages:previous.pages.length-complete.length};
    report.limitations.push('Resume melanjutkan per halaman. Halaman terputus atau gagal diulang; hasil halaman selesai mempertahankan versi asal.');
    if(maxPages<=complete.length)throw Error('Naikkan batas halaman untuk melanjutkan audit ini.');
    for(const p of complete)visited.add(p.url);
  }
  if(scope==='single')report.limitations[0]='Hanya URL input (atau tujuan redirect awalnya) yang diaudit. Sitemap dan penemuan link tidak dijalankan. Navigasi keluar halaman ditahan, sehingga sebagian perilaku event dapat berbeda.';
  const add = value => { const u = normalizeUrl(value, root,scope==='single'); if (u && (scope!=='single'||u===root) && new URL(u).origin === origin && !queued.has(u)) { queued.add(u); queue.push(u); } };
  add(root);
  if(previous)for(const url of [...previous.discovery.urls,...previous.pages.map(p=>p.url)])add(url);
  // Completed pages retain their observations and never enter the new work queue.
  for(let i=queue.length-1;i>=0;i--)if(visited.has(queue[i]))queue.splice(i,1);
  createRuntime(report);
  let nextEvent=report.events.reduce((n,e)=>Math.max(n,Number(e.id?.slice(3))||0),0)+1;
  let discoverySize=-1;
  const stats = page => {
    report.revision++;
    if(page)page.revision=report.revision;
    if(page)updatePage(report,page);
    report.durationMs=elapsedMs(report);
    if(discoverySize!==queued.size){report.discovery.urls=[...queued];discoverySize=queued.size;}
    report.summary=currentSummary(report,queued.size,queue.length,concurrency);
    onUpdate(report);
  };
  let browser, http1Browser;
  try {
    const chromium = await loadBrowser();
    let launch = {headless: true};
    const docker = process.env.EVENT_ATLAS_DOCKER === '1';
    if (docker) launch.chromiumSandbox = true;
    if (process.env.EVENT_ATLAS_BROWSER) launch.executablePath = process.env.EVENT_ATLAS_BROWSER;
    try { browser = await chromium.launch(launch); }
    catch (err) {
      if (docker || process.env.EVENT_ATLAS_BROWSER) throw err;
      launch = {headless:true,channel:'chrome'};
      try { browser = await chromium.launch(launch); }
      catch { throw new Error('Browser belum tersedia. Jalankan npx playwright install chromium atau pasang Google Chrome.'); }
    }
    const compatibilityBrowser = () => http1Browser ||= chromium.launch({...launch,args:['--disable-http2','--disable-quic']});
    // Browser request context uses a bounded timeout.
    const api = await browser.newContext();
    const fetchText = async url => {
      const response = await api.request.get(url, {timeout: 20000, maxRedirects: 4});
      if (!response.ok()) throw new Error('HTTP ' + response.status());
      if (new URL(response.url()).origin !== origin) throw new Error('Redirect di luar origin');
      const text = await response.text();
      if (text.length > 12000000) throw new Error('Sitemap terlalu besar');
      return text;
    };
    // Respect the generic robots policy; user-agent-specific rules are reported as a limit.
    let disallow = [], allow = [];
    const sitemapQueue = scope==='single'||previous?[]:[origin + '/sitemap.xml'];
    try {
      const robots = await fetchText(origin + '/robots.txt');
      let generic = false;
      for (const line of robots.split(/\r?\n/)) {
        const m = line.replace(/#.*/, '').match(/^\s*([^:]+):\s*(.*)$/); if (!m) continue;
        const key = m[1].trim().toLowerCase(), val = m[2].trim();
        if (key === 'user-agent') generic = val === '*';
        if (generic && key === 'disallow' && val) disallow.push(val);
        if (generic && key === 'allow' && val) allow.push(val);
        if (scope!=='single' && !previous && key === 'sitemap' && val) sitemapQueue.push(val);
      }
    } catch (err) { report.discovery.errors.push({url: origin + '/robots.txt', error: err.message}); }
    const ruleMatch = (pathname, rule) => { const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'); return new RegExp('^' + escaped).test(pathname); };
    const permitted = url => {
      const p = new URL(url).pathname + new URL(url).search;
      const deny = disallow.filter(r => ruleMatch(p,r)).sort((a,b)=>b.length-a.length)[0];
      const yes = allow.filter(r => ruleMatch(p,r)).sort((a,b)=>b.length-a.length)[0];
      return !deny || (yes && yes.length >= deny.length);
    };
    const sitemapSeen = new Set();
    while (sitemapQueue.length && sitemapSeen.size < 50 && !signal?.aborted) {
      const url = sitemapQueue.shift();
      if (sitemapSeen.has(url) || new URL(url, root).origin !== origin) continue;
      sitemapSeen.add(url);
      try {
        const xml = await fetchText(url);
        const locs = [...xml.matchAll(/<loc(?:\s[^>]*)?>\s*([\s\S]*?)\s*<\/loc>/gi)].map(m => m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
        report.discovery.sitemaps.push({url, urls: locs.length});
        if (/<sitemapindex[\s>]/i.test(xml)) sitemapQueue.push(...locs); else locs.forEach(add);
      } catch (err) { report.discovery.errors.push({url, error: err.message}); }
      stats();
    }
    await api.close();
    const worker=async()=>{
    while (queue.length && report.pages.length < maxPages && !signal?.aborted) {
      const url = queue.shift(); if (visited.has(url)) continue; visited.add(url);
      const p = {url, finalUrl: url, title: '', status: 'loading', httpStatus: null, actions: [], probes: [], elements: [], errors: [], runtimeErrors:[], tags: [], unparsedRequests:[], consent: 'unchanged'};
      const pageStarted=Date.now();
      report.pages.push(p); stats(p);
      if (logoutUrl(url)) {
        p.status = 'skipped';
        p.errors.push('Alur login atau logout perlu uji manual.');
        if (enabled.has('authentication')) p.probes.push({id:'auth', trigger:'authentication', status:'skipped', manual:true, reason:p.errors[0]});
        delete p.elements;
        stats(p);
        continue;
      }
      if (!permitted(url)) { p.status = 'skipped'; p.errors.push('Dilewati sesuai robots.txt'); delete p.elements; stats(p); continue; }
      let context;
      let initialEvents = [];
      const publishEvent = event => {report.events.push(event);indexEvent(report,event);};
      function flushInitialEvents() {
        for (const event of initialEvents || []) publishEvent(event);
        initialEvents = null;
      }
      const loadProbe = {id:'load', trigger:'page_load', status:enabled.has('page_load')?'pending':'skipped'};
      if (!enabled.has('page_load')) loadProbe.reason = 'Pemicu tidak dipilih.';
      p.probes.push(loadProbe);
      let phase = {type:enabled.has('page_load')?'page_load':'reset', element:null, id:'load'};
      let guarded = false;
      let page;
      let initialNavigation=true;
      const blockedNavigation=(targetUrl,method)=>{
        if(phase.type==='reset')return;
        const entry={url:targetUrl,method};
        p.blockedNavigations||=[];
        if(!p.blockedNavigations.some(n=>n.url===targetUrl&&n.method===method))p.blockedNavigations.push(entry);
        const action=p.actions.find(a=>a.id===phase.id);
        if(action){action.blockedNavigations||=[];action.blockedNavigations.push(entry);}
      };
      const eventMap = new Map();
      const record = data => {
        if(data.source==='navigation'){blockedNavigation(data.targetUrl,data.apiMethod);return;}
        if (data.source === 'submit-attempt') {
          if (phase.trigger === 'form_submit') phase.probe.submitObserved = true;
          return;
        }
        const platform=eventPlatform(data);
        if(!platforms.includes(platform))return;
        if (signal?.aborted || data.source === 'config') { if (data.source === 'config'&&!p.tags.includes(data.name)) p.tags.push(data.name); return; }
        if (phase.type === 'reset') return;
        const element = phase.element;
        const key = JSON.stringify([url, data.frameUrl || p.finalUrl, phase.id, platform, data.source, data.name, data.apiMethod||'',data.sdkInstance||'',data.measurementId || '', data.parameters]);
        const existing = eventMap.get(key);
        if (existing) { existing.count++; return; }
        const observed={...data,reportedPage:data.reportedPage||data.parameters?.page_location||''};
        const observation = {id: 'ev-' + nextEvent++, platform, page:url, finalPage:p.finalUrl, frameUrl:data.frameUrl || p.finalUrl, action:phase.type, actionId:phase.id, element, testElement:element, source:data.source, apiMethod:data.apiMethod||'',sdkInstance:data.sdkInstance||'', name:data.name, measurementId:data.measurementId || '', parameters:data.parameters || {}, endpoint:data.endpoint || '', reportedPage:observed.reportedPage, eventTime:data.eventTime||null, attribution:data.batch?'batch-time':element ? 'temporal' : 'page', isolation:phase.isolation||'isolated',provenanceVersion:VERSION,...classifyEvent(observed,phase,phase.originPage||p.finalUrl),time:iso(), count:1};
        observation.trigger = phase.trigger || (phase.type==='scroll'?'impression':phase.type);
        if (initialEvents) initialEvents.push(observation);
        else publishEvent(observation);
        eventMap.set(key, observation);
      };
      async function configurePage(selectedBrowser) {
        const current = await selectedBrowser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',acceptDownloads:false});
        context = current;
        const assetRoute=staticAssetCache(report.performance,{enabled:report.options.assetCache});
        await current.exposeBinding('__atlasRecord',({frame},data)=>{
          if(context===current)record({...data,frameUrl:data.frameUrl||frame.url()});
        });
        await current.addInitScript(instrumentActivity);
        await current.addInitScript(instrumentActionInspector);
        await current.addInitScript(instrument,platforms);
        await current.addInitScript(instrumentVendors,{platforms});
        if(scope==='single')await current.addInitScript(instrumentSinglePage);
        if (guardedProbes) {
          await current.addInitScript(instrumentGuardedProbe);
          await current.routeWebSocket('**/*', socket => socket.close());
        }
        await current.route('**/*', route=>handleRoute(route,async finish=>{
          if(context!==current)return finish.abort();
          const req = route.request();
          const hits = [...parseCollect(req.url(), req.postData() || '').map(e=>({...e,platform:'ga4'})),...parseVendorEvents(req.url(),req.postDataBuffer(),req.headers())];
          if (hits.length) {
            let frameUrl = ''; try { frameUrl = req.frame().url(); } catch {}
            hits.forEach(hit => record({...hit, source:'network', frameUrl}));
            if(hits.every(e=>e.platform==='ga4'))return finish.fulfill({status:204, headers:{'access-control-allow-origin':'*'}});
            return finish.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:hits[0].platform==='mixpanel'?'1':'{}'});
          }
          const recognized=recognizedEventEndpoint(req.url());
          if(recognized){
            if(platforms.includes(recognized)&&phase.type!=='reset'&&!knownEmptyPayload(req.url(),req.postDataBuffer(),req.headers())){
              const endpoint=new URL(req.url());const label=endpoint.origin+endpoint.pathname;
              if(!p.unparsedRequests.some(e=>e.endpoint===label))p.unparsedRequests.push({platform:recognized,endpoint:label,reason:'Payload tidak dikenali; bukan bukti event.'});
            }
            return finish.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:recognized==='mixpanel'?'1':'{}'});
          }
          const reqUrl = new URL(req.url());
          if (guarded) {
            if (req.isNavigationRequest()) blockedNavigation(req.url(), 'document');
            return finish.abort('blockedbyclient');
          }
          if (req.isNavigationRequest() && logoutUrl(req.url())) {
            blockedNavigation(req.url(), 'logout');
            return finish.abort('blockedbyclient');
          }
          if (req.isNavigationRequest() && reqUrl.origin !== origin) return finish.abort();
          if(scope==='single' && req.isNavigationRequest()){
            let popup=false;try{popup=req.frame().page()!==page;}catch{popup=true;}
            if(popup){blockedNavigation(req.url(),'popup-document');return finish.abort('blockedbyclient');}
          }
          if(scope==='single' && !initialNavigation && req.isNavigationRequest() && pageKey(req.url())!==pageKey(p.finalUrl)){
            blockedNavigation(req.url(),'document');return finish.abort('blockedbyclient');
          }
          if (!['GET','HEAD','OPTIONS'].includes(req.method())) return finish.abort();
          if (/google-analytics\.com$|analytics\.google\.com$|doubleclick\.net$/.test(reqUrl.hostname) && /collect|activity/.test(reqUrl.pathname)) return finish.fulfill({status:204});
          if(await assetRoute(route,finish.fulfill))return;
          return finish.continue();
        },message=>{
          if(context!==current)return;
          p.routeErrors ||= [];
          if(p.routeErrors.length<12&&!p.routeErrors.includes(message))p.routeErrors.push(message);
        }));
        page = await newPage();
      }
      async function newPage() {
        const nextPage = await context.newPage();
        nextPage.on('pageerror', err => {
          if (p.runtimeErrors.length < 12) {
            p.errors.push(err.message.slice(0,400));
            p.runtimeErrors.push(err.message.slice(0,400));
          }
        });
        return nextPage;
      }
      const load = async (timeout=30000) => {
        const navigationStarted=Date.now();report.performance.loads++;
        initialNavigation=true;
        const response = await page.goto(url, {waitUntil:'domcontentloaded',timeout});
        p.httpStatus = response?.status() || null; p.finalUrl = page.url();
        initialNavigation=false;
        const accessIssue=detectAccessIssue({html:await page.content(),title:await page.title(),url:page.url(),status:p.httpStatus});
        if(accessIssue){p.accessIssue=accessIssue;throw Error(accessIssue);}
        if(scope==='single')await page.evaluate(()=>{if(window.__atlasSingleScope){window.__atlasSingleScope.url=location.href;window.__atlasSingleScope.locked=true;}});
        if (p.httpStatus >= 400) throw new Error('HTTP ' + p.httpStatus);
        report.performance.navigationMs+=Date.now()-navigationStarted;
        await delay(waitMs);
        report.performance.observationMs+=waitMs;
        if (options.consent === 'accept') {
          const button = page.getByRole('button', {name:/^(accept all|allow all|terima semua|setujui semua|saya setuju)$/i}).first();
          if (await button.isVisible().catch(()=>false)) { await button.click({timeout:2000}); p.consent='accepted'; await delay(500); }
        }
        return p.httpStatus;
      };
      try {
        await configurePage(browser);
        p.navigationAttempts = [];
        await loadInitialPage(()=>load(navigationTimeoutMs),async()=>{
          const oldContext=context;
          context=null;
          await oldContext.close();
          initialEvents.length=0;
          eventMap.clear();
          p.finalUrl=url;
          p.httpStatus=null;
          p.tags=[];
          p.errors=[];
          p.runtimeErrors=[];
          p.unparsedRequests=[];
          delete p.blockedNavigations;
          delete p.routeErrors;
          await configurePage(await compatibilityBrowser());
        },p.navigationAttempts,signal);
        flushInitialEvents();
        if (loadProbe.status === 'pending') loadProbe.status = 'tested';
        p.title = await page.title();
        const html = await page.content();
        if(platforms.includes('ga4'))p.tags = [...new Set([...p.tags, ...(html.match(/\b(?:G-[A-Z0-9]+|GTM-[A-Z0-9]+)\b/g) || [])])];
        if(scope!=='single'){const links = await page.locator('a[href]').evaluateAll(els => els.map(e => e.href)); links.forEach(add);}
        if (enabled.has('impression')) {
          // An explicit selection adds bounded element probes to the legacy page scroll.
          const targets = report.options.triggerTargets
            ? await page.evaluate(impressionTargets) : [];
          for (const element of targets) {
            if (signal?.aborted) break;
            const probe = {id:'impression-' + p.probes.length, trigger:'impression', element, status:'pending'};
            p.probes.push(probe);
            const locator = page.locator(element.selector);
            phase = {type:'reset', element:null, id:'reset'};
            try {
              if (await locator.count() !== 1) throw Error('Selector tidak unik atau elemen berubah');
              if (await locator.evaluate(inspectVisibility)) {
                probe.status = 'skipped';
                probe.reason = 'Elemen sudah terlihat saat giliran uji.';
                continue;
              }
              phase = {type:'impression', element, id:probe.id};
              await locator.scrollIntoViewIfNeeded({timeout:2000});
              await delay(waitMs);
              report.performance.observationMs += waitMs;
              probe.status = await locator.evaluate(inspectVisibility) ? 'tested' : 'skipped';
              if (probe.status === 'skipped') probe.reason = 'Tidak terlihat';
            } catch (err) {
              probe.status = 'error';
              probe.reason = err.message.slice(0,300);
            }
            stats(p);
          }
          if (!signal?.aborted) {
            const probe = {id:'scroll', trigger:'impression', status:'pending'};
            p.probes.push(probe);
            phase = {type:'scroll', element:null, id:probe.id};
            await page.evaluate(async () => { for (let i=1;i<=5;i++) { window.scrollTo(0,document.documentElement.scrollHeight*i/5); await new Promise(r=>setTimeout(r,200)); } });
            await delay(waitMs);
            await page.evaluate(()=>window.scrollTo(0,0));
            report.performance.observationMs += waitMs;
            probe.status = 'tested';
          }
        }
        p.elements = await page.evaluate(inspectActions);
        let tested = 0;
        let reusable=false;
        for (const el of p.elements) {
          if (signal?.aborted) break;
          const action = {id:'click-' + p.actions.length, element:el, trigger:el.trigger, status:'pending', reason:el.reason, manual:el.manual};
          p.actions.push(action);
          if (!enabled.has(el.trigger)) {
            action.status = 'skipped';
            action.manual = false;
            action.reason ||= el.trigger === 'form_submit' ? 'Form/submit' : el.trigger === 'outbound' ? 'Link di luar origin' : 'Pemicu tidak dipilih.';
            continue;
          }
          if (el.reason || tested >= maxElements) { action.status='skipped'; action.reason ||= 'Batas elemen per halaman'; continue; }
          const guardedAction = el.trigger==='outbound'||el.trigger==='form_submit';
          tested++;
          try {
            phase = {type:'reset',element:null,id:'reset'};
            if (!page) page = await newPage();
            if(!reusable || guardedAction)await load();else report.performance.reusedClicks++;
            action.isolation=reusable?'reused-page':'isolated';reusable=false;
            const locator = page.locator(el.selector);
            if (await locator.count() !== 1) throw new Error('Selector tidak unik atau elemen berubah');
            await locator.scrollIntoViewIfNeeded({timeout:2000});
            await delay(250);
            const current = await locator.evaluate(element => window.__atlasDescribeAction(element));
            if (!current || current.trigger !== el.trigger || current.reason) {
              action.status = 'skipped';
              action.reason = current?.reason || 'Elemen berubah sebelum diuji.';
              action.manual = current?.manual || false;
              continue;
            }
            action.element = current;
            const before=!guardedAction&&report.options.resetPolicy==='smart'&&el.tag==='button'?await pageSignature(page).catch(()=>null):null;
            if (guardedAction) {
              guarded = true;
              await page.evaluate(trigger => {window.__atlasGuardedProbe = trigger;}, el.trigger);
            }
            phase = {type:'click',trigger:el.trigger,probe:action,element:current,id:action.id,originPage:page.url(),isolation:action.isolation};
            const clickStarted=Date.now();
            await locator.click({timeout:3000,noWaitAfter:true});
            await delay(waitMs);
            report.performance.clickMs+=Date.now()-clickStarted;report.performance.observationMs+=waitMs;
            if(before&&report.options.resetPolicy==='smart')reusable=before===await pageSignature(page).catch(()=>null);
            action.status='tested';
          } catch (err) { action.status='error'; action.reason=err.message.slice(0,300); }
          finally {
            if (guarded) {
              await page.close();
              page = undefined;
              guarded = false;
            }
          }
          stats(p);
        }
        p.status=signal?.aborted?'interrupted':'ok';
      } catch (err) {
        p.status=signal?.aborted?'interrupted':'error';
        p.navigationError=readableError(err);
        p.errors.push(p.navigationError);
        for (const probe of p.probes) if (probe.status === 'pending') {
          probe.status = 'error';
          probe.reason = p.navigationError;
        }
      }
      finally {
        await context?.close();
        flushInitialEvents();
        p.elementCount=p.elements.length;
        delete p.elements;
        p.tags=[...new Set(p.tags)];
        p.durationMs=Date.now()-pageStarted;
        stats(p);
      }
    }
    };
    const results=await Promise.allSettled(Array.from({length:concurrency},()=>worker()));
    const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
    report.status = signal?.aborted ? 'stopped' : queue.length ? 'limited' : 'completed';
    if (report.status==='completed' && report.summary.failed>0 && !report.summary.successful) {
      report.status='error';
      report.error='allPagesFailed';
    }
  } catch (err) { report.status='error'; report.error=err.message; }
  finally {
    await Promise.allSettled([browser?.close(),http1Browser?.then(instance=>instance.close(),()=>{})]);
    report.finishedAt=iso();
    report.durationMs=elapsedMs(report);
    report.events.forEach(e => delete e._key);
    stats();
  }
  return report;
}

export function csvReport(report) {
  const quote = v => { let s = typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''); if (/^[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g,'""') + '"'; };
  const columns = ['event_name','platform','source','page_url','test_action','element_text','selector','region','measurement_id','sdk_method','parameters','count','attribution','origin_page','event_page','event_category','relationship','isolation','engine_version','trigger'];
  return '\uFEFF' + [columns, ...report.events.map(e => [e.name,eventPlatform(e),e.source,e.page,e.action,e.element?.text || '',e.element?.selector || '',e.element?.region || '',e.measurementId,e.apiMethod||'',e.parameters,e.count,e.attribution,e.originPage||e.page,e.eventPage||e.frameUrl||e.page,e.eventCategory||'',e.relationship||'',e.isolation||'legacy',e.provenanceVersion||report.appVersion||'1.0.0',e.trigger||e.action])].map(row => row.map(quote).join(',')).join('\r\n');
}

export async function saveReport(report, directory) {
  await fs.mkdir(directory, {recursive:true});
  await fs.writeFile(path.join(directory, 'audit.json'), JSON.stringify(report));
  await fs.writeFile(path.join(directory, 'events.csv'), csvReport(report));
}
