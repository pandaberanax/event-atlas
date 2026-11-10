import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {Readable} from 'node:stream';
import {gzipSync} from 'node:zlib';
import {detectAccessIssue} from '../manual/page-access.js';
import {sitemapLocations,sitemapText} from '../sitemap-discovery.mjs';
import {mergeBrowserMap,createBrowserMapBridge} from '../browser-map.mjs';
import {scanWebsiteMap,websiteMapOptions} from '../website-map.mjs';
import {audit} from '../auditor.mjs';
import {validateWebsiteMap} from '../dist/website-map-model.js';

const challenge='<title>&nbsp;</title><script>function triggerInterstitialChallenge(){}</script><iframe src="https://example.com/splash"></iframe>';
test('verification detection distinguishes actual interstitials from normal forms and Cloudflare JS detection',()=>{
  assert.equal(detectAccessIssue({html:challenge}),'pageVerificationRequired');
  assert.equal(detectAccessIssue({title:'Just a moment...',html:'<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>'}),'pageVerificationRequired');
  assert.equal(detectAccessIssue({html:'<div id="px-captcha"></div>'}),'pageVerificationRequired');
  assert.equal(detectAccessIssue({title:'Access Denied',html:'Access denied',status:403}),'pageAccessDenied');
  assert.equal(detectAccessIssue({title:'Contact us',html:'<form><div class="cf-turnstile"></div></form>'}),null);
  assert.equal(detectAccessIssue({title:'Product',html:'<script src="/cdn-cgi/challenge-platform/h/b/scripts/jsd/script.js"></script><h1>Product</h1>'}),null);
  assert.equal(detectAccessIssue({title:'How to fix Access Denied',html:'An article about access denied errors'}),null);
});

test('XML handling reads gzip, namespaces and entities; rejects verification HTML instead of treating it as an empty sitemap',()=>{
  const xml='<s:urlset><s:url><s:loc><![CDATA[https://example.com/tipsaman/a?x=1&y=2]]></s:loc></s:url></s:urlset>';
  assert.equal(sitemapText(gzipSync(Buffer.from(xml))),xml);
  assert.deepEqual(sitemapLocations(xml),['https://example.com/tipsaman/a?x=1&y=2']);
  assert.throws(()=>sitemapLocations(challenge),/pageVerificationRequired/);
  assert.throws(()=>sitemapLocations('<html>not XML</html>'),/mapInvalidSitemapContent/);
});

test('Chrome captures merge child paths without visiting links, preserve query scope and reject verification/origin changes',()=>{
  const options={...websiteMapOptions({url:'https://example.com/tipsaman',scope:'subfolder',includePath:'/tipsaman',keepQuery:true}),projectId:'p'};
  const snapshot={page:options.url,title:'Tips',links:['/tipsaman/artikel-tips-aman/a','/tipsaman/artikel-tips-aman/a','/tipsaman-other/a','/help','https://outside.example/a']};
  const first=mergeBrowserMap(options,snapshot);
  assert.equal(first.pages.length,2);assert.equal(first.summary.ok,1);assert.equal(first.summary.pending,1);assert.equal(first.status,'partial');
  assert.equal(first.pages[0].httpStatus,null);assert.equal(first.pages[1].status,'discovered');
  const second=mergeBrowserMap(options,{page:'https://example.com/tipsaman/artikel-tips-aman/a',title:'Article',links:[]},first);
  assert.equal(second.pages.length,2);assert.equal(second.summary.ok,2);assert.equal(second.status,'completed');assert.equal(second.id,first.id);
  assert.throws(()=>mergeBrowserMap(options,{...snapshot,accessIssue:'pageVerificationRequired'},second),/pageVerificationRequired/);
  assert.throws(()=>mergeBrowserMap(options,{...snapshot,page:'https://outside.example/tipsaman'}),/mapBrowserWrongSite/);
  assert.throws(()=>mergeBrowserMap(options,{...snapshot,page:'https://example.com/help'}),/mapBrowserOutsideScope/);
  const transient=mergeBrowserMap(options,{...snapshot,links:['/tipsaman/a?bm-verify=secret','/tipsaman/a']});
  assert.equal(transient.pages.filter(p=>p.url==='https://example.com/tipsaman/a').length,1);
  const legacy={...first,appVersion:'1.5.11',browserCapture:undefined,pages:first.pages.map(({provenanceVersion,...row})=>row)};
  const updated=mergeBrowserMap(options,snapshot,legacy);assert.equal(updated.pages[1].provenanceVersion,'1.5.11');
  const historical={...legacy,pages:[{url:'https://example.com/tipsaman?bm-verify=historical',status:'discovered',title:''}]};
  assert.equal(validateWebsiteMap(historical),historical);
});

test('Chrome pairing checks extension origin, expiry, active project and size before accepting snapshots',async()=>{
  let now=1000,busy=false,current=true,calls=0;
  const bridge=createBrowserMapBridge({prepare:async()=>({options:{projectId:'p'}}),onCapture:async()=>++calls,isBusy:()=>busy,isCurrent:()=>current,now:()=>now});
  const code=(await bridge.prepare({})).code;
  async function request(headers,body={}){
    const req=Readable.from([Buffer.from(JSON.stringify(body))]);Object.assign(req,{method:'POST',headers});let result;
    await bridge.handle(req,{setHeader(){}},new URL('http://127.0.0.1/api/manual/map-links'),(status,data)=>result={status,data});return result;
  }
  const headers={origin:'chrome-extension://'+'a'.repeat(32),'x-atlas-pairing':code};
  assert.equal((await request({...headers,origin:'https://example.com'})).status,403);
  assert.equal((await request({...headers,'x-atlas-pairing':'bad'})).status,403);
  assert.equal((await request(headers)).status,200);assert.equal(calls,1);
  busy=true;assert.equal((await request(headers)).status,409);busy=false;
  current=false;assert.equal((await request(headers)).status,403);current=true;
  assert.equal((await request(headers,{large:'x'.repeat(4*1024*1024)})).status,413);
  now+=31*60*1000;assert.equal((await request(headers)).status,403);
  assert.equal(calls,1);
});

test('mapping reads sitemap indexes beyond the old 50-file cutoff, gzip and redirects despite a blocked input page',{timeout:45000},async()=>{
  let origin,documents=0;
  const server=http.createServer((req,res)=>{
    if(req.url==='/robots.txt')return res.end('User-agent: *');
    if(req.url==='/sitemap.xml')return res.end('<sitemapindex>'+Array.from({length:59},(_,i)=>`<sitemap><loc>${origin}/maps/${i}.xml</loc></sitemap>`).join('')+`<sitemap><loc>${origin}/maps/final.xml</loc></sitemap></sitemapindex>`);
    if(req.url==='/maps/final.xml'){res.writeHead(302,{Location:'/maps/target.xml.gz'});return res.end();}
    if(req.url==='/maps/target.xml.gz')return res.end(gzipSync(Buffer.from(`<urlset><url><loc>${origin}/tipsaman/artikel-tips-aman/a</loc></url><url><loc>${origin}/help</loc></url></urlset>`)));
    if(req.url.startsWith('/maps/'))return res.end('<urlset></urlset>');
    documents++;res.setHeader('Content-Type','text/html');res.end(challenge);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
  try{
    const report=await scanWebsiteMap({url:origin+'/tipsaman',scope:'subfolder',includePath:'/tipsaman',maxPages:100});
    assert.equal(report.status,'partial');assert.equal(report.summary.ok,0);assert.equal(report.summary.verification,1);assert.equal(report.pages.length,2);
    assert.equal(report.discovery.sitemapsRead,61);assert.equal(report.discovery.sitemapsPending,0);
    assert.equal(report.pages[1].url,origin+'/tipsaman/artikel-tips-aman/a');assert.equal(report.pages[1].status,'discovered');assert.equal(documents,1);
    const partial=await scanWebsiteMap({url:origin+'/tipsaman',method:'sitemap',scope:'subfolder',includePath:'/tipsaman',maxSitemaps:2,maxPages:100});
    assert.equal(partial.discoveryComplete,false);assert.ok(partial.discovery.sitemapsPending>0);assert.equal(partial.status,'partial');
    const resumed=await scanWebsiteMap({resume:partial,maxSitemaps:500});assert.equal(resumed.discoveryComplete,true);assert.equal(resumed.pages.length,2);
    const result=await audit({url:origin+'/tipsaman',scope:'single',platforms:['dataLayer'],maxElements:0});
    assert.equal(result.pages[0].accessIssue,'pageVerificationRequired');assert.equal(result.pages[0].status,'error');assert.equal(result.events.length,0);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
