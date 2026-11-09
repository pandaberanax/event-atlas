import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {elapsedMs,formatDuration,pageIssues,mergeReport} from '../dist/model.js';
import {VERSION,CHANGELOG} from '../dist/release.js';
import {messages,t,setLanguage,translateEvidence} from '../dist/i18n.js';
import {audit} from '../auditor.mjs';

test('timer tracks a live audit and freezes completed and stopped reports',()=>{
 const start='2026-11-04T07:00:00Z',end='2026-11-04T08:02:03Z';
 assert.equal(formatDuration(elapsedMs({startedAt:start},Date.parse(end))),'01:02:03');
 assert.equal(elapsedMs({startedAt:start,finishedAt:end},Date.parse(end)+999999),3723000);
 assert.equal(elapsedMs({startedAt:'invalid'}),0);assert.equal(elapsedMs({startedAt:end,finishedAt:start}),0);
});
test('both languages cover interface keys and preserve source evidence',async()=>{
 for(const [key,values]of Object.entries(messages)){assert.equal(values.length,2,key);for(const text of values)assert.ok(typeof text==='string'&&text.length>0,key);}
 const html=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/sequis/i);
 const app=await fs.readFile(new URL('../dist/app.js',import.meta.url),'utf8');assert.doesNotMatch(app,/sequis-initial/);
 for(const match of html.matchAll(/data-i18n(?:-aria|-placeholder)?="([^"]+)"/g))assert.ok(messages[match[1]],match[1]);
 setLanguage('en');assert.equal(t('statIssues'),'Needs review');assert.equal(t('pageOption',{n:25}),'25 pages');assert.equal(translateEvidence('Tidak terlihat'),'Not visible');assert.equal(translateEvidence('click_button'),'click_button');
 setLanguage('id');assert.equal(t('statIssues'),'Perlu diperiksa');
 const pkg=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url)));assert.equal(pkg.version,VERSION);assert.equal(CHANGELOG[0].version,VERSION);
});
test('review reasons include JavaScript and click errors without treating deliberate element skips as failures',()=>{
 assert.equal(pageIssues({status:'ok',errors:['JS error'],actions:[]}).attention,true);
 assert.equal(pageIssues({status:'ok',runtimeErrors:[],errors:[],actions:[{status:'skipped'}]}).attention,false);
 const p=pageIssues({status:'ok',errors:[],actions:[{status:'error',reason:'timeout'},{status:'skipped'}]});assert.equal(p.attention,true);assert.equal(p.failedActions.length,1);assert.equal(p.skippedActions.length,1);
 assert.equal(pageIssues({status:'error',errors:['HTTP 500']}).failed,true);
});
test('incremental merge preserves interleaved parallel events and updated counts',()=>{
 const previous={id:'r',pages:[{url:'a',status:'loading'},{url:'b',status:'loading'}],events:[{id:'ev-1',page:'a',count:1},{id:'ev-2',page:'b',count:1},{id:'ev-3',page:'a',count:1}]};
 const incoming={id:'r',revision:10,pages:[{url:'a',status:'ok'}],events:[{id:'ev-1',page:'a',count:2},{id:'ev-3',page:'a',count:1},{id:'ev-4',page:'a',count:1}]};
 const merged=mergeReport(previous,incoming,{pageIndexes:[0],eventPages:['a']});
 assert.equal(merged.pages[1].url,'b');assert.equal(merged.pages[0].status,'ok');assert.deepEqual(merged.events.map(e=>e.id),['ev-1','ev-2','ev-3','ev-4']);assert.equal(merged.events[0].count,2);assert.equal(previous.events[0].count,1);
 const old=mergeReport(previous,{id:'r',pages:[{url:'b',status:'ok'}],events:[{id:'ev-3',page:'b'}]},{pageFrom:1,eventFrom:2});assert.equal(old.pages[1].status,'ok');
});
test('parallel browser audit respects worker and page limits, keeps page attribution, and records duration', {timeout:60000},async()=>{
 let active=0,peak=0;
 const server=http.createServer((req,res)=>{
  const base=`http://127.0.0.1:${server.address().port}`;
  if(req.url==='/robots.txt'){res.end('User-agent: *');return;}
  if(req.url==='/sitemap.xml'){res.end('<urlset>'+['/','/a','/b','/c'].map(p=>'<url><loc>'+base+p+'</loc></url>').join('')+'</urlset>');return;}
  if(req.url.startsWith('/g/collect')){res.statusCode=500;res.end('Must be intercepted');return;}
  if(!['/','/a','/b','/c'].includes(req.url)){res.statusCode=404;res.end();return;}
  active++;peak=Math.max(peak,active);
  setTimeout(()=>{active--;res.setHeader('Content-Type','text/html');res.end(`<html><head><title>Parallel fixture</title><script>fetch('/g/collect?v=2&tid=G-TEST&en=parallel_page&ep.path='+encodeURIComponent(location.pathname))</script></head><body><h1>${req.url}</h1></body></html>`);},350);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const r=await audit({url:`http://127.0.0.1:${server.address().port}/`,maxPages:3,maxElements:0,concurrency:2,waitMs:500});
  assert.equal(r.status,'limited');assert.equal(r.pages.length,3);assert.equal(r.options.concurrency,2);assert.equal(peak,2);assert.equal(new Set(r.pages.map(p=>p.url)).size,3);
  assert.equal(r.events.length,3);for(const e of r.events)assert.equal(e.parameters.path,new URL(e.page).pathname);
  assert.equal(r.appVersion,VERSION);assert.equal(r.durationMs,Date.parse(r.finishedAt)-Date.parse(r.startedAt));assert.ok(r.durationMs>0);assert.equal(r.summary.activeUrls.length,0);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
