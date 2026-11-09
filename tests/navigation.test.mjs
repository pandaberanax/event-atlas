import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {loadInitialPage,handleRoute} from '../navigation.mjs';
import {staticAssetCache} from '../asset-cache.mjs';
import {audit} from '../auditor.mjs';

test('an HTTP/2 navigation failure triggers one HTTP/1.1 attempt',async()=>{
  const attempts=[];
  let switches=0;
  await loadInitialPage(async protocol=>{
    if(protocol==='default')throw Error('page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://example.com/\nCall log:\n\u001b[2mdebug');
    return 200;
  },async()=>{switches++;},attempts);
  assert.equal(switches,1);
  assert.deepEqual(attempts,[
    {protocol:'default',status:'error',error:'page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://example.com/'},
    {protocol:'http1',status:'ok',httpStatus:200},
  ]);
  const denied=[];
  await assert.rejects(loadInitialPage(async()=>{throw Error('HTTP 403');},async()=>{switches++;},denied),/403/);
  assert.equal(switches,1);
  assert.equal(denied.length,1);
  const canceled=new AbortController();
  const stopped=[];
  await assert.rejects(loadInitialPage(async()=>{
    canceled.abort();
    throw Error('page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://example.com/');
  },async()=>{switches++;},stopped,canceled.signal),/HTTP2/);
  assert.equal(switches,1);
  assert.equal(stopped.length,1);
});

test('asset fetch failure can continue once, and a failed fulfill never completes the route again',async()=>{
  const metrics={cacheHits:0,cacheBytesSaved:0,assetFetches:0};
  const cache=staticAssetCache(metrics);
  const requests=[];
  const errors=[];
  const createRoute=(failFetch,failFulfill)=>({
    request:()=>({url:()=> 'https://example.com/logo.png',method:()=> 'GET',resourceType:()=> 'image',allHeaders:async()=>({})}),
    async fetch(){
      if(failFetch)throw Error('fetch failed before fulfillment');
      return {headers:()=>({'cache-control':'no-store'}),status:()=>200};
    },
    async fulfill(){
      requests.push('fulfill');
      if(failFulfill)throw Error('Route is already handled!');
    },
    async continue(){requests.push('continue');},
    async abort(){requests.push('abort');},
  });
  for(const route of [createRoute(true,false),createRoute(false,true),createRoute(false,false)]){
    await handleRoute(route,async finish=>{
      if(!await cache(route,finish.fulfill)) await finish.continue();
    },message=>errors.push(message));
  }
  assert.deepEqual(requests,['continue','fulfill','fulfill']);
  assert.deepEqual(errors,[]);
});

test('a failed single page is reported as a failed audit, with no HTTP protocol retry for 403',{timeout:20000},async()=>{
  const server=http.createServer((req,res)=>{
    if(req.url==='/robots.txt'){res.end('User-agent: *');return;}
    res.writeHead(403,{'Content-Type':'text/html'}).end('Denied');
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  try {
    const report=await audit({url:'http://127.0.0.1:'+server.address().port,scope:'single',triggers:['page_load'],assetCache:false,waitMs:500});
    assert.equal(report.status,'error');
    assert.equal(report.error,'allPagesFailed');
    assert.equal(report.summary.failed,1);
    assert.equal(report.summary.successful,0);
    assert.equal(report.pages[0].httpStatus,403);
    assert.deepEqual(report.pages[0].navigationAttempts,[{protocol:'default',status:'error',error:'HTTP 403'}]);
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
});
