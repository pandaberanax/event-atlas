import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createProjectStore,projectRunKey} from '../project-store.mjs';
import {projectInventory,projectPageDetails,projectUrl,eventAtUrl} from '../dist/project-model.js';
import {createWebsiteMapStore} from '../website-map-store.mjs';
import {scanWebsiteMap} from '../website-map.mjs';

const root='https://example.com/';
const sample=overrides=>({id:randomUUID(),schemaVersion:1,mode:'website-map',appVersion:'1.6.0',root,status:'completed',revision:1,dataRevision:1,
  startedAt:'2026-11-01T00:00:00Z',pages:[{url:root+'products/a',title:'A',status:'ok',httpStatus:200}],options:{},warnings:[],...overrides});

test('projects persist selection, isolate websites, retain original evidence and remove only map references',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-project-test-'));
  const store=createProjectStore(directory);let restored;
  try{
    const a=await store.create({name:'Client A',url:root}),b=await store.create({name:'Client B',url:'https://other.example'});
    await store.select(a.id);
    await assert.rejects(store.resolve('https://other.example/a',a.id),/projectWrongSite/);
    assert.equal((await store.resolve('https://www.example.com/a',a.id)).id,a.id);
    const map=sample({projectId:a.id}),audit=sample({projectId:a.id,mode:undefined,events:[{id:'1',name:'click',page:root+'products/a',parameters:{long:'x'.repeat(8000)}}]});
    store.observe(map);await store.archive(map);await store.archive(audit);
    assert.equal(store.get(a.id).runs.find(r=>r.kind==='map').storage,'history');
    restored=createProjectStore(directory);await restored.restore();
    assert.equal(restored.activeId,a.id);assert.equal(restored.get(b.id).runs.length,0);
    const read=await restored.read(a.id,projectRunKey(audit));assert.equal(read.appVersion,'1.6.0');assert.equal(read.events[0].parameters.long.length,8000);
    await assert.rejects(restored.read(b.id,projectRunKey(audit)),/projectMissing/);
    const other={...audit,projectId:b.id,root:'https://other.example/',events:[]};await restored.archive(other);
    assert.notEqual(projectRunKey(audit),projectRunKey(other));assert.equal((await restored.read(a.id,projectRunKey(audit))).events.length,1);
    await restored.removeMap(map.id);assert.equal(restored.get(a.id).runs.length,1);assert.equal(restored.get(a.id).runs[0].kind,'audit');
    await assert.rejects(restored.select('../outside'),/projectMissing/);
  }finally{await store.close();await restored?.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('URL links preserve query variants and hash routes; inventory uses the latest audit for each URL',()=>{
  const url=root+'products/a?item=1',other=root+'products/a?item=2';
  const event=(page,name)=>({id:name,page,name,platform:'ga4',source:'network',parameters:{item_id:1}});
  const map=sample({pages:[{url,title:'Product',status:'ok',httpStatus:200},{url:other,title:'Variant',status:'ok'}]});
  const older=sample({mode:undefined,startedAt:'2026-11-02T00:00:00Z',pages:[{url,status:'ok'}],events:[event(url,'old'),event(url,'old2')]});
  const newer=sample({mode:undefined,startedAt:'2026-11-03T00:00:00Z',pages:[{url,status:'ok'}],events:[event(url,'new')]});
  const sources=[{key:'m',report:map},{key:'a',report:older},{key:'b',report:newer}];
  const rows=projectInventory(sources);assert.equal(rows.length,2);assert.equal(rows.find(p=>p.url===url).events,1);assert.equal(rows.find(p=>p.url===other).audit,null);
  const detail=projectPageDetails(sources,url);assert.equal(detail.matches.length,3);assert.equal(detail.matches[0].events[0].name,'new');
  assert.equal(eventAtUrl(event(url,'x'),other),false);
  assert.notEqual(projectUrl(root+'#/a'),projectUrl(root+'#/b'));
  assert.equal(projectUrl(root+'?b=2&a=1'),root+'?a=1&b=2');
  assert.equal(projectUrl('javascript:alert(1)'),'');
  const external=sample({mode:undefined,pages:[],events:[{...event(url,'outbound'),reportedPage:'https://outside.example/'}]});
  assert.equal(projectInventory([{key:'x',report:external}]).some(p=>p.url==='https://outside.example/'),false);
});

test('map snapshots skip unchanged writes; deletion removes the file and index without affecting another scan',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-map-delete-'));
  const store=createWebsiteMapStore(directory,{intervalMs:60000});
  try{
    const a=sample(),b=sample();store.begin(a);await store.finish(a);
    const first=await fs.stat(path.join(directory,a.id+'.json'));await store.flush();
    assert.equal((await fs.stat(path.join(directory,a.id+'.json'))).mtimeMs,first.mtimeMs);
    store.begin(b);await store.finish(b);
    await assert.rejects(store.remove('../outside'),/mapInvalidReport/);
    await store.remove(b.id);await assert.rejects(fs.stat(path.join(directory,b.id+'.json')),error=>error.code==='ENOENT');
    assert.deepEqual(store.list().map(s=>s.id),[a.id]);assert.equal((await store.read(a.id)).appVersion,'1.6.0');
    const restored=createWebsiteMapStore(directory);assert.equal((await restored.restore()).id,a.id);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('map workers refill before a slow peer finishes and process dynamically discovered URLs within concurrency limits',{timeout:30000},async()=>{
  let origin,active=0,peak=0,slowDone=0,nextStarted=0;
  const site=http.createServer((req,res)=>{
    if(req.url==='/robots.txt')return res.end('User-agent: *');
    if(req.url==='/sitemap.xml')return res.end(`<urlset>${['/slow','/fast','/next'].map(p=>'<url><loc>'+origin+p+'</loc></url>').join('')}</urlset>`);
    if(req.url==='/next')nextStarted=Date.now();
    active++;peak=Math.max(peak,active);
    setTimeout(()=>{active--;if(req.url==='/slow')slowDone=Date.now();res.setHeader('Content-Type','text/html');res.end('<title>Fixture</title>'+(req.url==='/next'?'<a href="/dynamic">Dynamic</a>':''));},req.url==='/slow'?1300:60);
  });
  site.listen(0,'127.0.0.1');await once(site,'listening');origin='http://127.0.0.1:'+site.address().port;
  try{const report=await scanWebsiteMap({url:origin,maxPages:20,concurrency:2});
    assert.equal(report.status,'completed');assert.equal(report.pages.length,5);assert.equal(report.summary.ok,5);assert.equal(peak,2);
    assert.ok(nextStarted<slowDone,'the next URL must start while the slow peer is loading');assert.equal(new Set(report.pages.map(p=>p.url)).size,5);
  }finally{site.closeAllConnections();await new Promise(resolve=>site.close(resolve));}
});
