import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {audit,normalizeUrl} from '../auditor.mjs';
import {auditScope,pageKey} from '../dist/scope.js';

test('single-page scope is validated and preserves the requested query and fragment',()=>{
 assert.equal(auditScope(),'site');assert.equal(auditScope('single'),'single');assert.throws(()=>auditScope('unknown'));
 assert.equal(normalizeUrl('https://example.com/product?utm_source=test&plan=A#offer',undefined,true),'https://example.com/product?utm_source=test&plan=A#offer');
 assert.equal(pageKey('https://example.com/a?b=2&a=1#section'),pageKey('https://example.com/a?a=1&b=2'));
 assert.notEqual(pageKey('https://example.com/a?plan=B'),pageKey('https://example.com/a?plan=A'));
 assert.notEqual(pageKey('https://example.com/#/one',undefined,true),pageKey('https://example.com/#/two',undefined,true));
});
test('single-page audit skips sitemap/link discovery and holds link, JS, SPA, and popup navigation', {timeout:60000},async()=>{
 const requests=[];
 const server=http.createServer((req,res)=>{
  requests.push(req.url);
  if(req.url==='/robots.txt'){res.end(`User-agent: *\nSitemap: http://127.0.0.1:${server.address().port}/extra.xml`);return;}
  if(req.url==='/sitemap.xml'||req.url==='/extra.xml'){res.end('<urlset><url><loc>/other</loc></url></urlset>');return;}
  if(req.url.startsWith('/other')||req.url.startsWith('/js-other')||req.url.startsWith('/popup')){res.end('<title>Should not be audited</title>');return;}
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><title>Single URL fixture</title><script>window.dataLayer=[];function gtag(){dataLayer.push(arguments)};gtag('event','initial',{url:location.href});</script></head><body><main>
  <a id="link" href="/other" onclick="gtag('event','link_clicked',{url:location.href})">Read more</a>
  <button id="spa" type="button" onclick="history.pushState({},'', '/spa-other');gtag('event','spa_clicked',{url:location.href})">Explore</button>
  <button id="js" type="button" onclick="gtag('event','js_clicked',{url:location.href});location.href='/js-other'">See details</button>
  <button id="popup" type="button" onclick="window.open('/popup');gtag('event','popup_clicked',{url:location.href})">Open details</button>
  </main></body></html>`);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/target?utm_source=test&plan=A#offer`;
 try{
  const r=await audit({url,scope:'single',platforms:['ga4'],maxPages:100,maxElements:4,concurrency:3,waitMs:500});
  assert.equal(r.status,'completed',r.error);assert.equal(r.pages.length,1);assert.equal(r.options.maxPages,1);assert.equal(r.options.concurrency,1);assert.equal(r.options.scope,'single');assert.deepEqual(r.discovery.urls,[url]);assert.equal(r.discovery.sitemaps.length,0);
  assert.equal(requests.some(u=>u.includes('sitemap')||u.includes('extra.xml')),false);
  assert.equal(requests.some(u=>/^\/(?:other|js-other|popup|spa-other)/.test(u)),false,requests.join('\n'));
  for(const name of ['link_clicked','spa_clicked','js_clicked','popup_clicked']){const e=r.events.find(e=>e.name===name);assert.ok(e,name);assert.equal(e.page,url);assert.ok(e.parameters.url.includes('utm_source=test'));}
  assert.ok(r.pages[0].actions.find(a=>a.element.selector==='#link').blockedNavigations.length);
  assert.ok(r.pages[0].blockedNavigations.some(n=>n.method==='history.pushState'));
  assert.ok(r.pages[0].blockedNavigations.some(n=>n.method==='window.open'));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('single-page mode records initial same-origin redirects without adding another crawl target', {timeout:30000},async()=>{
 const requests=[];
 const server=http.createServer((req,res)=>{
  requests.push(req.url);
  if(req.url==='/robots.txt'){res.end('User-agent: *');return;}
  if(req.url==='/start'){res.writeHead(302,{Location:'/canonical?plan=A'});res.end();return;}
  res.setHeader('Content-Type','text/html');res.end('<html><title>Canonical</title><a href="/other">Other page</a></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const root=`http://127.0.0.1:${server.address().port}`;const r=await audit({url:root+'/start',scope:'single',maxElements:0,waitMs:500});assert.equal(r.status,'completed',r.error);assert.equal(r.pages.length,1);assert.equal(r.pages[0].finalUrl,root+'/canonical?plan=A');assert.deepEqual(r.discovery.urls,[root+'/start']);assert.equal(requests.includes('/sitemap.xml'),false);assert.equal(requests.includes('/other'),false);}finally{await new Promise(resolve=>server.close(resolve));}
});
