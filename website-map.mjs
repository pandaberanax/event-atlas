import {randomUUID} from 'node:crypto';
import {loadBrowser} from './auditor.mjs';
import {VERSION} from './dist/release.js';
import {mapUrl} from './dist/website-map-model.js';
import {recognizedEventEndpoint} from './vendor-network.mjs';
import {handleRoute, readableError} from './navigation.mjs';

const MAX_SITEMAPS = 50;
const error = (key,status=400) => Object.assign(Error(key),{status});

export function websiteMapOptions(input) {
  const root = mapUrl(input.url,undefined,input.keepQuery === true);
  if (!root) throw error('mapInvalidUrl');
  return {url:root,maxPages:Math.max(1,Math.min(10000,Math.floor(Number(input.maxPages)||1000))),
    concurrency:Math.max(1,Math.min(4,Math.floor(Number(input.concurrency)||3))),
    rendered:input.rendered === true,keepQuery:input.keepQuery === true};
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
  options = websiteMapOptions(options);
  const report = {schemaVersion:1,mode:'website-map',appVersion:VERSION,id:randomUUID(),root:options.url,options,
    startedAt:new Date().toISOString(),finishedAt:null,durationMs:0,status:'running',revision:0,pages:[],sitemaps:[],warnings:[]};
  let origin = new URL(report.root).origin;
  const known = new Map();
  let limitHit = false;
  let browser;
  let context;
  let permitted = () => true;
  const publish = () => {
    report.revision++;
    report.durationMs = Date.now()-Date.parse(report.startedAt);
    report.summary = {discovered:report.pages.length,inspected:report.pages.filter(row=>!['discovered','loading'].includes(row.status)).length,
      failed:report.pages.filter(row=>row.status==='error').length,skipped:report.pages.filter(row=>row.status==='skipped').length};
    onUpdate(report);
  };
  function add(value,source,foundOn) {
    const url = mapUrl(value,foundOn || report.root,options.keepQuery);
    if (!url || new URL(url).origin !== origin || known.has(url)) return;
    if (known.size >= options.maxPages) {limitHit=true;return;}
    const row = {url,title:'',status:'discovered',httpStatus:null,source,foundOn};
    known.set(url,row);
    report.pages.push(row);
  }
  const abort = () => {void browser?.close().catch(()=>{});};
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
    context = await browser.newContext({javaScriptEnabled:options.rendered,serviceWorkers:'block',userAgent:'EventAtlas/1.5 WebsiteMap'});
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
          && report.pages.length <= 1 && report.pages.every(row=>row.status==='loading');
        if (!canonical) return finish.abort();
      }
      return finish.continue();
    },message => {if(report.warnings.length<100)report.warnings.push({url:requestSafe(route),error:message});}));

    async function inspect(row,first=false) {
      if (signal?.aborted) return;
      row.status='loading';publish();
      const page = await context.newPage();
      try {
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
        row.title = (await page.title()).slice(0,2000);
        row.status = row.httpStatus >= 400 ? 'error' : row.finalUrl !== row.url ? 'redirect' : 'ok';
        if (options.rendered) await page.waitForTimeout(900);
        const links = await page.locator('a[href],area[href]').evaluateAll(elements => elements.slice(0,20000).map(el=>el.href));
        for (const link of links) add(link,'link',row.finalUrl);
      } catch (failure) {
        row.status = signal?.aborted ? 'discovered' : 'error';
        if (!signal?.aborted) row.error=readableError(failure).slice(0,4000);
      } finally {await page.close().catch(()=>{});publish();}
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
    if (first && permitted(first.url)) await inspect(first,true);
    else if (first) {first.status='skipped';first.error='mapRobots';}
    if (new URL(options.url).origin !== origin && !signal?.aborted) await readRobots();
    if (!signal?.aborted) await discover();
    let cursor=0;
    while (cursor<report.pages.length && !signal?.aborted) {
      const batch=report.pages.slice(cursor,cursor+options.concurrency);
      cursor+=batch.length;
      await Promise.all(batch.map(async row => {
        if (row.status!=='discovered') return;
        if (!permitted(row.url) || /(?:^|\/)(?:logout|log-out|signout|sign-out)(?:\/|$)/i.test(new URL(row.url).pathname)) {
          row.status='skipped';row.error='mapRobotsOrAction';publish();return;
        }
        await inspect(row);
      }));
    }
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

export function createWebsiteMap() {
  let report;
  let running;
  let controller;
  return {
    get active() {return !!running;},
    get report() {return report;},
    start(input) {
      if (running) throw error('mapBusy',409);
      const options=websiteMapOptions(input);
      controller=new AbortController();
      report=undefined;
      running=scanWebsiteMap(options,value=>{report=value;},controller.signal).finally(()=>{running=undefined;});
    },
    stop() {controller?.abort();},
    async shutdown() {controller?.abort();await running;}
  };
}
