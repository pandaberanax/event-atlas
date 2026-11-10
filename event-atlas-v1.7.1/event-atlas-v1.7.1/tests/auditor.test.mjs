import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {audit,normalizeUrl,parseCollect,csvReport} from '../auditor.mjs';

test('GA4 GET and batch POST parameters preserve common fields',()=>{
 const hits=parseCollect('https://region1.google-analytics.com/g/collect?v=2&tid=G-TEST&dl=https%3A%2F%2Fexample.com%2F','en=page_view\nen=select_content&ep.link_text=Detail&epn.value=12');
 assert.equal(hits.length,2);assert.equal(hits[1].name,'select_content');assert.equal(hits[1].parameters.link_text,'Detail');assert.equal(hits[1].parameters.value,'12');
 assert.deepEqual(parseCollect('https://example.com/?en=anything'),[]);
});
test('URL scope normalization keeps functional queries and excludes files',()=>{
 assert.equal(normalizeUrl('/a?utm_source=test&q=health#button','https://example.com/'),'https://example.com/a?q=health');
 assert.equal(normalizeUrl('javascript:alert(1)'),null);assert.equal(normalizeUrl('https://example.com/a.pdf'),null);
});
test('CSV preserves event mapping and escapes formula cells',()=>{
 const csv=csvReport({events:[{name:'=formula',source:'network',page:'https://example.com',action:'click',element:{text:'A, B',selector:'#cta',region:'main'},parameters:{a:'x"y'},count:1,attribution:'temporal'}]});
 assert.ok(csv.includes('"\'=formula"'));assert.ok(csv.includes('"A, B"'));assert.ok(csv.includes('"#cta"'));
});
test('browser audit maps clicks, intercepts GA4, excludes robots/forms, survives GTM queue replacement', {timeout:90000},async()=>{
 let forwardedHits=0,mutations=0;
 const server=http.createServer((req,res)=>{
  const base=`http://127.0.0.1:${server.address().port}`;
  if(req.url.startsWith('/g/collect')){forwardedHits++;res.end('should not reach');return;}
  if(req.url==='/mutate'){mutations++;res.end('should not reach');return;}
  if(req.url==='/robots.txt'){res.end('User-agent: *\nDisallow: /secret\nSitemap: '+base+'/sitemap.xml');return;}
  if(req.url==='/sitemap.xml'){res.end('<urlset><url><loc>'+base+'/</loc></url><url><loc>'+base+'/second</loc></url><url><loc>'+base+'/secret</loc></url><url><loc>'+base+'/broken</loc></url></urlset>');return;}
  if(req.url==='/broken'){res.statusCode=500;res.end('broken');return;}
  res.setHeader('Content-Type','text/html');
  res.end(`<!doctype html><html><head><title>Fixture audit</title><script>
  window.dataLayer=[];function gtag(){dataLayer.push(arguments)};
  const previous=dataLayer.push;dataLayer.push=function(){return previous.apply(dataLayer,arguments)};
  gtag('config','G-TEST');gtag('event','fixture_load',{page_kind:'fixture'});
  fetch('/g/collect?v=2&tid=G-TEST&en=page_view&dl='+encodeURIComponent(location.href));
  </script></head><body><main><h1>Audit fixture</h1>
  <button id="cta" type="button" onclick="dataLayer.push({event:'local_click',button_name:'Lihat detail'});fetch('/g/collect?v=2&tid=G-TEST',{method:'POST',body:'en=select_content&ep.link_text=Lihat+detail\\nen=custom_cta&ep.position=hero'});fetch('/mutate',{method:'POST',body:'blocked'}).catch(()=>{})">Lihat detail</button>
  <form><button type="submit">Kirim</button></form><a href="/second">Halaman dua</a><a href="/secret">Secret</a>
  </main></body></html>`);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const report=await audit({url:`http://127.0.0.1:${server.address().port}/`,maxPages:4,maxElements:1,waitMs:500});
  assert.equal(report.status,'completed',JSON.stringify(report));assert.equal(report.summary.failed,1);assert.equal(report.pages.find(p=>p.url.endsWith('/secret')).status,'skipped');
  const click=report.events.find(e=>e.name==='select_content');assert.ok(click);assert.equal(click.element.selector,'#cta');assert.equal(click.element.text,'Lihat detail');assert.equal(click.source,'network');assert.equal(click.parameters.link_text,'Lihat detail');
  assert.ok(report.events.some(e=>e.name==='custom_cta'));assert.ok(report.events.some(e=>e.name==='fixture_load'&&e.source==='gtag'));
  const local=report.events.find(e=>e.name==='local_click');assert.equal(local.count,1,'GTM push replacement must not duplicate observations');
  assert.ok(report.pages[0].actions.some(a=>a.reason==='Form/submit'));assert.equal(forwardedHits,0);assert.equal(mutations,0);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
