import {randomUUID} from 'node:crypto';
import {loadBrowser} from './auditor.mjs';
import {VERSION} from './dist/release.js';
import {mapUrl,pathWithin,pathDepth,validateWebsiteMap} from './dist/website-map-model.js';
import {createWebsiteMapStore} from './website-map-store.mjs';
import {recognizedEventEndpoint} from './vendor-network.mjs';
import {handleRoute, readableError} from './navigation.mjs';

const MAX_SITEMAPS = 50;
const error = (key,status=400) => Object.assign(Error(key),{status});
function logoutUrl(value){
  const url=new URL(value);
  return /(?:^|\/)(?:logout|log-out|signout|sign-out)(?:\/|$)/i.test(url.pathname) ||
    ['action','do'].some(key=>/^(?:logout|log-out|signout|sign-out)$/i.test(url.searchParams.get(key)||''));
}

export function websiteMapOptions(input) {
  const root = mapUrl(input.url,undefined,input.keepQuery === true);
  if (!root) throw error('mapInvalidUrl');
  const method=input.method || (input.rendered===true?'javascript':'links');
  if(!['sitemap','links','javascript'].includes(method))throw error('mapInvalidMethod');
  const scope=input.scope==='subfolder'?'subfolder':'site';
  function path(value){
    if(typeof value!=='string' || value.length>2000 || !value.startsWith('/') || value.startsWith('//') || /[?#\\]/.test(value))throw error('mapInvalidPath');
    return new URL(value,new URL(root).origin).pathname.replace(/\/$/,'')||'/';
  }
  const includePath=scope==='subfolder'?path(input.includePath||new URL(root).pathname):'/';
  const excluded=Array.isArray(input.excludePaths)?input.excludePaths:String(input.excludePaths||'').split(/[\n,]/);
  if(excluded.length>100)throw error('mapInvalidPath');
  const excludePaths=[...new Set(excluded.map(value=>String(value).trim()).filter(Boolean).map(path))];
  const maxScanDepth=input.maxScanDepth===null||input.maxScanDepth===undefined||input.maxScanDepth===''?null:Number(input.maxScanDepth);
  if(maxScanDepth!==null && (!Number.isInteger(maxScanDepth)||maxScanDepth<0||maxScanDepth>50))throw error('mapInvalidDepth');
  const start=new URL(root);
  if(scope==='subfolder'){start.pathname=includePath;start.search='';}
  if(maxScanDepth!==null && pathDepth(start.href)>maxScanDepth)throw error('mapInvalidDepth');
  return {url:start.href,maxPages:Math.max(1,Math.min(10000,Math.floor(Number(input.maxPages)||1000))),
    concurrency:Math.max(1,Math.min(5,Math.floor(Number(input.concurrency)||3))),
    method,scope,includePath,excludePaths,maxScanDepth,rendered:method==='javascript',keepQuery:input.keepQuery === true};
}

function robotsPolicy(text) {
  const groups = [];
  let group;
  for (const line of text.split(/\r?\n/)) {
    const match = line.replace(/#.*/,'').match(/^\s*([^:]+):\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1].toLowerCase().trim();
    const value = match[2];
    if (key === 'user-agent') {
      if (!group || group.rules.length) {group={agents:[],rules:[]};groups.push(group);}
      group.agents.push(value.toLowerCase());
    } else if (group && ['allow','disallow'].includes(key) && value) group.rules.push({allow:key==='allow',value});
  }
  const specific = groups.filter(item => item.agents.includes('eventatlas'));
  const rules = (specific.length ? specific : groups.filter(item => item.agents.includes('*'))).flatMap(item => item.rules);
  return url => {
    const target = new URL(url).pathname + new URL(url).search;
    let winner;
    for (const rule of rules) {
      const escaped = rule.value.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\\\$$/,'$');
      const length = rule.value.replace(/\*/g,'').length;
      if (new RegExp('^'+escaped).test(target) && (!winner || length > winner.length || length === winner.length && rule.allow)) {
        winner = {...rule,length};
      }
    }
    return !winner || winner.allow;
  };
}

export async function scanWebsiteMap(options, onUpdate=()=>{}, signal) {
  const previous=options.resume?validateWebsiteMap(options.resume):null;
  if(previous)options={...previous.options,url:previous.root,maxPages:options.maxPages||previous.options?.maxPages,
    concurrency:options.concurrency||previous.options?.concurrency};
  options = websiteMapOptions(options);
  const now=new Date().toISOString();
  const report = {schemaVersion:1,mode:'website-map',appVersion:VERSION,
    id:previous&&/^[a-f0-9-]{36}$/.test(previous.id)?previous.id:randomUUID(),root:options.url,options,
    startedAt:previous?.startedAt||now,sessionStartedAt:now,previousDurationMs:Math.max(0,Number(previous?.durationMs)||0),
    finishedAt:null,durationMs:0,status:'running',revision:0,pages:[],sitemaps:[],warnings:[]};
  if(previous){
    report.pages=structuredClone(previous.pages);
    report.resumedFrom={id:previous.id,appVersion:previous.appVersion};
    for(const row of report.pages){
      if(['error','loading'].includes(row.status))row.status='discovered';
      else if(row.status!=='discovered')row.provenanceVersion ||= previous.appVersion;
    }
  }
  let origin = new URL(report.root).origin;
  const known = new Map(report.pages.map(row=>[row.url,row]));
  let limitHit = false;
  let browser;
  let context;
  let permitted = () => true;
  const publish = () => {
    report.revision++;
    report.durationMs = report.previousDurationMs+Date.now()-Date.parse(report.sessionStartedAt);
    const count=status=>report.pages.filter(row=>row.status===status).length;
    report.summary = {discovered:report.pages.length,inspected:count('ok')+count('redirect')+count('error'),
      ok:count('ok'),redirect:count('redirect'),failed:count('error'),skipped:count('skipped'),pending:count('discovered')+count('loading')};
    onUpdate(report);
  };
  function add(value,source,foundOn) {
    const url = mapUrl(value,foundOn || report.root,options.keepQuery);
    if (!url || new URL(url).origin !== origin || known.has(url)) return;
    const pathname=new URL(url).pathname;
    if(!pathWithin(pathname,options.includePath) || options.excludePaths.some(prefix=>pathWithin(pathname,prefix)) ||
      options.maxScanDepth!==null&&pathDepth(url)>options.maxScanDepth)return;
    if (known.size >= options.maxPages) {limitHit=true;return;}
    const row = {url,title:'',status:'discovered',httpStatus:null,source,foundOn,provenanceVersion:VERSION};
    known.set(url,row);
    report.pages.push(row);
  }
  const abort = () => {void browser?.close().catch(()=>{});};
  publish();
  try {
    const chromium = await loadBrowser();
    const launch = {headless:true};
    if (process.env.EVENT_ATLAS_BROWSER) launch.executablePath = process.env.EVENT_ATLAS_BROWSER;
    if (process.env.EVENT_ATLAS_DOCKER === '1') launch.chromiumSandbox = true;
    try {browser=await chromium.launch(launch);}
    catch (failure) {
      if (launch.executablePath || launch.chromiumSandbox) throw failure;
      browser = await chromium.launch({...launch,channel:'chrome'});
    }
    signal?.addEventListener('abort',abort,{once:true});
    if (signal?.aborted) {abort();throw error('mapStopped');}
    context = await browser.newContext({javaScriptEnabled:options.rendered,serviceWorkers:'block',userAgent:'EventAtlas/1.6 WebsiteMap'});
    await context.route('**/*',route => handleRoute(route,async finish => {
      const request=route.request();
      const url = new URL(request.url());
      const resource=request.resourceType();
      const tracking=recognizedEventEndpoint(url.href) || /(^|\.)(google-analytics\.com|analytics\.google\.com)$/.test(url.hostname);
      if (tracking || ['image','media','font'].includes(resource) || !['GET','HEAD'].includes(request.method())) return finish.abort();
      if (request.isNavigationRequest() && new URL(request.url()).origin !== origin) {
        const input=new URL(report.root);
        const canonical = url.hostname.replace(/^www\./,'') === input.hostname.replace(/^www\./,'')
          && !url.username && !url.password && ['http:','https:'].includes(url.protocol)
          && report.pages.length <= 1 && report.pages.every(row=>row.status==='loading')
          && pathWithin(url.pathname,options.includePath) && !options.excludePaths.some(prefix=>pathWithin(url.pathname,prefix));
        if (!canonical) return finish.abort();
      }
      if(request.isNavigationRequest() && url.origin===origin && (!permitted(url.href) ||
        !pathWithin(url.pathname,options.includePath) || options.excludePaths.some(prefix=>pathWithin(url.pathname,prefix)) ||
        options.maxScanDepth!==null&&pathDepth(url.href)>options.maxScanDepth))return finish.abort();
      return finish.continue();
    },message => {if(report.warnings.length<100)report.warnings.push({url:requestSafe(route),error:message});}));

    async function inspect(row,first=false) {
      if (signal?.aborted) return;
      row.status='loading';delete row.error;row.httpStatus=null;row.provenanceVersion=VERSION;publish();
      let page;
      try {
        page=await context.newPage();
        const response = await page.goto(row.url,{waitUntil:'domcontentloaded',timeout:20000});
        row.httpStatus = response?.status() ?? null;
        const final = mapUrl(page.url(),undefined,options.keepQuery);
        if (first && final && new URL(final).origin !== origin) {
          origin = new URL(final).origin;
          known.delete(row.url);
          row.url = final;
          known.set(final,row);
          report.root=final;
        }
        row.finalUrl = final || page.url();
        if (!final || new URL(final).origin !== origin) throw error('mapOutsideOrigin');
        if (options.rendered) await page.waitForTimeout(900);
        row.title = (await page.title()).slice(0,2000);
        const links = await page.locator('a[href],area[href]').evaluateAll(elements => elements.slice(0,20000).map(el=>el.href));
        for (const link of links) add(link,'link',row.finalUrl);
        row.status = row.httpStatus >= 400 ? 'error' : row.finalUrl !== row.url ? 'redirect' : 'ok';
      } catch (failure) {
        row.status = signal?.aborted ? 'discovered' : 'error';
        if (!signal?.aborted) row.error=readableError(failure).slice(0,4000);
      } finally {await page?.close().catch(()=>{});publish();}
    }
    async function fetchText(url) {
      const response = await context.request.get(url,{timeout:15000,maxRedirects:0});
      try {
        if (!response.ok()) throw Error('HTTP '+response.status());
        const content = await response.text();
        if (content.length > 8*1024*1024) throw error('mapSitemapLarge');
        return content;
      } finally {await response.dispose();}
    }
    let sitemapSeeds=[];
    async function readRobots() {
      sitemapSeeds=[origin+'/sitemap.xml'];
      permitted=()=>true;
      try {
        const robots=await fetchText(origin+'/robots.txt');
        permitted=robotsPolicy(robots);
        for (const match of robots.matchAll(/^\s*sitemap:\s*(\S+)/gmi)) sitemapSeeds.push(match[1]);
      } catch (failure) {report.warnings.push({url:origin+'/robots.txt',error:readableError(failure)});}
    }
    async function discover() {
      const queue=[...sitemapSeeds];
      const seen=new Set();
      while (queue.length && seen.size<MAX_SITEMAPS && !signal?.aborted) {
        const value=queue.shift();
        let url;
        try {url=new URL(value,report.root);} catch {continue;}
        if (url.origin !== origin || url.username || url.password || seen.has(url.href)) continue;
        seen.add(url.href);
        try {
          const xml=await fetchText(url.href);
          const locs=[...xml.matchAll(/<(?:\w+:)?loc(?:\s[^>]*)?>\s*([\s\S]*?)\s*<\/(?:\w+:)?loc>/gi)]
            .map(match=>match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
              .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,code)=>{const point=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return point<=0x10ffff?String.fromCodePoint(point):'';})
              .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&'));
          report.sitemaps.push({url:url.href,urls:locs.length});
          if (/<(?:\w+:)?sitemapindex[\s>]/i.test(xml)) queue.push(...locs.slice(0,MAX_SITEMAPS));
          else for (const loc of locs) add(loc,'sitemap',url.href);
        } catch (failure) {if(report.warnings.length<100)report.warnings.push({url:url.href,error:readableError(failure)});}
        publish();
      }
      if (queue.length) report.warnings.push({error:'mapSitemapLimit'});
    }
    // Discover robots before visiting the input URL. Canonical host redirects are resolved once.
    add(report.root,'input',report.root);
    await readRobots();
    const first=known.get(report.root);
    if(first?.status==='discovered'&&logoutUrl(first.url)){first.status='skipped';first.error='mapSensitiveUrl';}
    if (options.method!=='sitemap' && first?.status==='discovered' && permitted(first.url)) await inspect(first,true);
    else if (first?.status==='discovered'&&!permitted(first.url)) {first.status='skipped';first.error='mapRobots';}
    if (new URL(options.url).origin !== origin && !signal?.aborted) await readRobots();
    if (!signal?.aborted) await discover();
    report.discoveryComplete=!signal?.aborted;
    let cursor=0;
    while (cursor<report.pages.length && !signal?.aborted && options.method!=='sitemap') {
      const batch=report.pages.slice(cursor,cursor+options.concurrency);
      cursor+=batch.length;
      await Promise.all(batch.map(async row => {
        if (row.status!=='discovered') return;
        if (!permitted(row.url) || logoutUrl(row.url)) {
          row.status='skipped';row.error=!permitted(row.url)?'mapRobots':'mapSensitiveUrl';publish();return;
        }
        await inspect(row);
      }));
    }
    if(options.method==='sitemap')for(const row of report.pages)if(!permitted(row.url)){row.status='skipped';row.error='mapRobots';}
    report.status=signal?.aborted?'stopped':limitHit?'limited':report.pages.every(row=>['error','skipped'].includes(row.status))?'error':'completed';
  } catch (failure) {
    report.status=signal?.aborted?'stopped':'error';
    if (!signal?.aborted) report.error=readableError(failure);
  } finally {
    signal?.removeEventListener('abort',abort);
    await browser?.close().catch(()=>{});
    for (const row of report.pages) if(row.status==='loading')row.status='discovered';
    report.finishedAt=new Date().toISOString();
    publish();
  }
  return report;
}

function requestSafe(route) {try{return route.request().url();}catch{return '';}}

export function createWebsiteMap(directory,{intervalMs=5000}={}) {
  const store=directory?createWebsiteMapStore(directory,{intervalMs}):null;
  let report;
  let running;
  let controller;
  return {
    get active() {return !!running;},
    get report() {return report;},
    warning:'',
    async restore(){
      try{report=await store?.restore();}catch{this.warning='mapRestoreError';}
    },
    history:()=>store?.list()||[],
    read:async id=>store?.read(id),
    start(input) {
      if (running) throw error('mapBusy',409);
      const options=websiteMapOptions(input);
      controller=new AbortController();
      report=undefined;
      let begun=false;
      running=scanWebsiteMap(options,value=>{
        report=value;
        if(store){if(!begun){store.begin(value);begun=true;}else store.observe(value);}
      },controller.signal).then(async value=>{await store?.finish(value);}).finally(()=>{running=undefined;});
    },
    resume(input={}){
      if(running)throw error('mapBusy',409);
      const previous=validateWebsiteMap(input.report||report);
      const options=websiteMapOptions({...previous.options,url:previous.root,maxPages:input.maxPages||previous.options?.maxPages,
        concurrency:input.concurrency||previous.options?.concurrency});
      if(options.maxPages<previous.pages.length)throw error('mapResumeLimit');
      controller=new AbortController();
      let begun=false;
      running=scanWebsiteMap({...options,resume:previous},value=>{
        report=value;
        if(store){if(!begun){store.begin(value);begun=true;}else store.observe(value);}
      },controller.signal).then(async value=>{await store?.finish(value);}).finally(()=>{running=undefined;});
    },
    stop() {controller?.abort();},
    async shutdown() {controller?.abort();await running;await store?.flush();}
  };
}
