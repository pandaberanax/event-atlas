import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {scanWebsiteMap,createWebsiteMap,websiteMapOptions} from '../website-map.mjs';
import {createWebsiteMapStore} from '../website-map-store.mjs';
import {compareWebsiteMaps,websiteComparisonCsv,websiteMapRows} from '../dist/website-map-model.js';

async function fixture(paths,{latency=0}={}){
  const hits=[];let origin,active=0,peak=0;
  const server=http.createServer((req,res)=>{
    hits.push(req.url);
    if(req.url==='/robots.txt'){res.end('User-agent: *\nDisallow:');return;}
    if(req.url==='/sitemap.xml'){res.end('<urlset>'+paths.map(value=>'<url><loc>'+origin+value+'</loc></url>').join('')+'</urlset>');return;}
    active++;peak=Math.max(peak,active);
    setTimeout(()=>{active--;res.setHeader('Content-Type','text/html');res.end('<title>Fixture '+req.url+'</title><a href="/outside">Outside scope</a>');},latency);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
  return {origin,hits,peak:()=>peak,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}

test('sitemap-only scope records URLs without inspecting HTML and respects subfolder boundaries and scan depth',{timeout:30000},async()=>{
  const site=await fixture(['/products/a','/products/b','/products/private/a','/products/a/deeper','/products-other/a']);
  try{
    const report=await scanWebsiteMap({url:site.origin,method:'sitemap',scope:'subfolder',includePath:'/products',
      excludePaths:'/products/private',maxScanDepth:2,concurrency:5});
    assert.equal(report.status,'completed');
    assert.deepEqual(report.pages.map(row=>new URL(row.url).pathname),['/products','/products/a','/products/b']);
    assert.ok(report.pages.every(row=>row.status==='discovered'));
    assert.equal(report.summary.inspected,0);assert.equal(report.summary.pending,3);
    assert.deepEqual(site.hits,['/robots.txt','/sitemap.xml']);
    assert.throws(()=>websiteMapOptions({url:site.origin,scope:'subfolder',includePath:'/products/a',maxScanDepth:1}),/mapInvalidDepth/);
  }finally{await site.close();}
});

test('link discovery honors exclusions and uses at most five concurrent document loads',{timeout:45000},async()=>{
  const paths=Array.from({length:12},(_,i)=>'/products/item-'+i);
  const site=await fixture([...paths,'/products/private/a','/products-other/a'],{latency:600});
  try{
    const report=await scanWebsiteMap({url:site.origin,scope:'subfolder',includePath:'/products',
      excludePaths:['/products/private'],maxScanDepth:2,concurrency:5});
    assert.equal(report.status,'completed',JSON.stringify(report));
    assert.equal(report.pages.length,13);
    assert.ok(report.pages.every(row=>row.status==='ok'));
    assert.equal(site.peak(),5);
    assert.ok(!site.hits.includes('/outside')&&!site.hits.includes('/products-other/a')&&!site.hits.includes('/products/private/a'));
  }finally{await site.close();}
});

test('disk checkpoints restore interrupted work and resume keeps completed page provenance and excludes downtime',{timeout:45000},async()=>{
  const site=await fixture(['/pending']);
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'event-atlas-map-'));
  const id=randomUUID();
  const previous={schemaVersion:1,mode:'website-map',appVersion:'1.5.11',id,root:site.origin+'/',
    options:{url:site.origin+'/',maxPages:10,concurrency:1,rendered:false,keepQuery:false},
    startedAt:'2020-01-01T00:00:00.000Z',durationMs:40000,status:'running',revision:1,
    pages:[{url:site.origin+'/',title:'Already complete',status:'ok',httpStatus:200,source:'input'},
      {url:site.origin+'/pending',title:'',status:'loading',httpStatus:null,source:'sitemap'}],sitemaps:[],warnings:[]};
  const store=createWebsiteMapStore(directory,{intervalMs:20});
  let audit;
  try{
    store.begin(previous);await store.finish(previous);
    audit=createWebsiteMap(directory);await audit.restore();
    assert.equal(audit.report.status,'interrupted');
    assert.equal(audit.report.pages[1].status,'discovered');
    assert.equal(audit.history()[0].id,id);
    audit.resume({maxPages:20,concurrency:5});
    for(let i=0;i<100&&audit.active;i++)await delay(100);
    assert.equal(audit.active,false);
    assert.equal(audit.report.status,'completed');
    assert.ok(!site.hits.includes('/'));
    assert.ok(site.hits.includes('/pending'));
    assert.equal(audit.report.pages[0].provenanceVersion,'1.5.11');
    assert.equal(audit.report.appVersion,'1.7.1');
    assert.ok(audit.report.durationMs>=40000&&audit.report.durationMs<55000);
    assert.ok(audit.report.checkpoint.savedAt);
    const restored=createWebsiteMap(directory);await restored.restore();
    assert.equal(restored.report.status,'completed');
    assert.equal(restored.report.pages.length,audit.report.pages.length);
  }finally{await audit?.shutdown();await site.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('scan comparison identifies discovered, absent, status and redirect differences and flags scope or partial coverage',()=>{
  const root='https://example.com/';
  const row=(pathname,overrides={})=>({url:root.slice(0,-1)+pathname,title:'Page',status:'ok',httpStatus:200,...overrides});
  const before={schemaVersion:1,mode:'website-map',root,status:'completed',options:{maxPages:100},
    pages:[row('/same'),row('/gone'),row('/status'),row('/redirect',{status:'redirect',finalUrl:root+'old'}),row('/pending')]};
  const after={...before,status:'stopped',options:{maxPages:100,scope:'subfolder',includePath:'/products'},
    pages:[row('/same'),row('/new'),row('/status',{status:'error',httpStatus:404}),
      row('/redirect',{status:'redirect',finalUrl:root+'new'}),row('/pending',{status:'discovered',httpStatus:null})]};
  const result=compareWebsiteMaps(before,after);
  assert.deepEqual(result.totals,{added:1,notFound:1,status:1,redirect:1,unchanged:2});
  assert.equal(result.sameScope,false);assert.equal(result.partial,true);
  assert.match(websiteComparisonCsv(result.rows),/previous_status/);
  assert.equal(websiteMapRows(after,{status:'pending'}).length,1);
  assert.equal(websiteMapRows(after,{status:'inspected'}).length,4);
  assert.throws(()=>compareWebsiteMaps(before,{...after,root:'https://other.example/',pages:[]}),/mapCompareOrigin/);
});
