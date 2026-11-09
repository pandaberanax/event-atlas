import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {audit} from '../auditor.mjs';
import {fixture} from './performance.fixture.mjs';
import {classifyEvent,eventInfo,groupEvents,resumeRemaining} from '../dist/event-model.js';
import {elapsedMs} from '../dist/model.js';
import {checkpointWriter,readCheckpoint} from '../checkpoint.mjs';
import {staticAssetCache} from '../asset-cache.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const testRoot=path.resolve(fileURLToPath(new URL('../reports/',import.meta.url)));
await fs.mkdir(testRoot,{recursive:true});
async function cleanup(dir){const resolved=path.resolve(dir);if(!resolved.startsWith(testRoot+path.sep))throw Error('Invalid test cleanup path');await fs.rm(resolved,{recursive:true,force:true});}

test('event relationships separate page navigation, synchronous handlers, temporal and batch evidence',()=>{
 const phase={type:'click',element:{selector:'#cta'}};
 assert.equal(classifyEvent({name:'gtm_pageview',frameUrl:'https://x.test/a'},phase,'https://x.test/').relationship,'navigation');
 assert.equal(classifyEvent({name:'custom',frameUrl:'https://x.test/',interaction:{selector:'#cta'}},phase,'https://x.test/').eventCategory,'interaction');
 assert.equal(classifyEvent({name:'custom',frameUrl:'https://x.test/'},phase,'https://x.test/').relationship,'after-click');
 assert.equal(classifyEvent({name:'custom',batch:true,frameUrl:'https://x.test/'},phase,'https://x.test/').relationship,'batch');
 const old={name:'gtm_pageview',page:'https://x.test/',frameUrl:'https://x.test/a',action:'click',element:{selector:'#cta'}};
 assert.equal(eventInfo(old).legacy,true);assert.equal(eventInfo(old).attribution,'navigation');
 const groups=groupEvents([old,{...old,id:'second'}]);assert.equal(groups.length,1);assert.equal(groups[0].pages.size,1);assert.equal(groups[0].events.length,2);
});

test('static cache respects request variants, private responses, authorization, expiry and size limits',async()=>{
 const metrics={cacheHits:0,cacheBytesSaved:0,assetFetches:0};const cache=staticAssetCache(metrics,{maxBytes:20});
 const request=async(url,requestHeaders={},responseHeaders={'cache-control':'public, max-age=60'},body='script')=>{
  let fetched=0,continued=0;
  const response={headers:()=>responseHeaders,status:()=>200,body:async()=>Buffer.from(body)};
  const route={request:()=>({url:()=>url,method:()=>'GET',resourceType:()=>'script',allHeaders:async()=>requestHeaders}),fetch:async()=>{fetched++;return response;},fulfill:async()=>{},continue:async()=>continued++};
  const handled=await cache(route);return{fetched,handled,continued};
 };
 assert.equal((await request('https://x.test/public.js',{'accept-language':'id'})).fetched,1);
 assert.equal((await request('https://x.test/public.js',{'accept-language':'id'})).fetched,0);
 assert.equal((await request('https://x.test/public.js',{'accept-language':'en'})).fetched,1,'language variants cannot share a cache entry');
 assert.equal((await request('https://x.test/public.js',{authorization:'Bearer test'})).handled,false);
 for(const headers of [{'cache-control':'no-store'},{'cache-control':'private, max-age=60'},{'cache-control':'public, max-age=60','set-cookie':'x=1'},{'cache-control':'max-age=60',age:'120'},{'cache-control':'max-age=60',vary:'*'}]){
  const url='https://x.test/'+Math.random()+'.js';await request(url,{},headers);assert.equal((await request(url,{},headers)).fetched,1);
 }
 const large='a'.repeat(30);await request('https://x.test/large.js',{},undefined,large);assert.equal((await request('https://x.test/large.js',{},undefined,large)).fetched,1);
 assert.ok(metrics.cacheHits>=1);
});

test('checkpoint timer writes without requiring a finished audit',async()=>{
 const dir=await fs.mkdtemp(new URL('../reports/checkpoint-timer-',import.meta.url));const writer=checkpointWriter(dir,{intervalMs:20});
 try{
  writer.observe({schemaVersion:1,id:'timer',status:'running',startedAt:new Date().toISOString(),pages:[],events:[],options:{},discovery:{urls:[]}});
  await new Promise(resolve=>setTimeout(resolve,80));
  const restored=await readCheckpoint(dir);assert.equal(restored.id,'timer');assert.equal(restored.status,'interrupted');
 }finally{writer.close();await writer.flush();await cleanup(dir);}
});

test('page-level resume retains completed provenance, repeats partial pages, restores durable checkpoints and excludes downtime',{timeout:60000},async()=>{
 const f=await fixture();const dir=await fs.mkdtemp(new URL('../reports/checkpoint-test-',import.meta.url));
 try{
  const first=await audit({url:f.url,maxPages:1,maxElements:0,waitMs:500,concurrency:1,platforms:['dataLayer']});
  assert.equal(first.status,'limited');first.appVersion='1.3.0';delete first.events[0].provenanceVersion;
  const rootCount=f.hits.documents['/'];
  first.pages.push({url:f.url+'a',status:'loading',actions:[],elementCount:1,revision:999});
  first.events.push({id:'ev-999',page:f.url+'a',name:'partial_should_repeat',source:'dataLayer',platform:'dataLayer'});
  first.status='running';first.finishedAt=null;first.startedAt=new Date(Date.now()-100000).toISOString();
  const writer=checkpointWriter(dir,{intervalMs:30});writer.observe(first);await writer.flush();writer.close();
  const recovered=await readCheckpoint(dir);assert.equal(recovered.status,'interrupted');assert.ok(recovered.checkpoint.savedAt);assert.equal(recovered.events.length,2);assert.equal(resumeRemaining(recovered),2);
  const resumed=await audit({resume:recovered,maxPages:3,waitMs:500,concurrency:2});
  assert.equal(resumed.status,'completed',resumed.error);assert.equal(resumed.pages.length,3);assert.equal(f.hits.documents['/'],rootCount);
  assert.equal(resumed.events[0].provenanceVersion,'1.3.0');assert.ok(!resumed.events.some(e=>e.name==='partial_should_repeat'));assert.equal(new Set(resumed.events.map(e=>e.id)).size,resumed.events.length);
  assert.equal(resumed.resumedFrom.repeatedPages,1);assert.equal(resumeRemaining(resumed),0);assert.ok(resumed.previousDurationMs>=100000);
  assert.equal(resumed.durationMs,resumed.previousDurationMs+Date.parse(resumed.finishedAt)-Date.parse(resumed.sessionStartedAt));
  assert.equal(elapsedMs({startedAt:'2020-01-01',sessionStartedAt:'2026-01-01T00:00:00Z',previousDurationMs:5000,finishedAt:'2026-01-01T00:00:02Z'}),7000);
  await assert.rejects(()=>audit({resume:resumed,maxPages:3}),/Naikkan batas/);
 }finally{await f.close();await cleanup(dir);}
});

test('browser evidence labels destination pageviews and click-handler calls without treating requests as handler proof',{timeout:45000},async()=>{
 const f=await fixture();try{
  const r=await audit({url:f.url,maxPages:1,maxElements:4,concurrency:1,waitMs:500,assetCache:true});
  const handler=r.events.find(e=>e.source==='dataLayer'&&e.name==='select_feature');assert.equal(handler?.relationship,'click-handler',JSON.stringify(r.events));
  const network=r.events.find(e=>e.source==='network'&&e.name==='select_feature');assert.equal(network?.relationship,'after-click');
  const nav=r.events.find(e=>e.name==='gtm_pageview'&&e.action==='click');assert.equal(nav?.relationship,'navigation');assert.equal(nav.eventPage,f.url+'a');assert.equal(nav.originPage,f.url);
  assert.ok(r.performance.cacheHits>0);assert.ok(f.hits.privateAssets>f.hits.publicAssets);assert.equal(f.hits.analytics,0);assert.equal(f.hits.mutations,0);
 }finally{await f.close();}
});
