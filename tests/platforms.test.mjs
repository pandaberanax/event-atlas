import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {gzipSync} from 'node:zlib';
import {parseVendorEvents,recognizedEventEndpoint,knownEmptyPayload} from '../vendor-network.mjs';
import {selectedPlatforms,eventPlatform,uniqueEvents} from '../dist/platforms.js';
import {audit,csvReport} from '../auditor.mjs';

test('platform choices are validated and older evidence is mapped without relabeling reports',()=>{
 assert.throws(()=>selectedPlatforms([]));assert.throws(()=>selectedPlatforms(['other']));assert.deepEqual(selectedPlatforms(['braze','braze']),['braze']);
 assert.equal(eventPlatform({source:'gtag'}),'ga4');assert.equal(eventPlatform({source:'dataLayer'}),'dataLayer');
 assert.equal(uniqueEvents([{platform:'braze',name:'View',source:'sdk'},{platform:'braze',name:'View',source:'network'},{platform:'mixpanel',name:'View',source:'sdk'}]),2);
 const csv=csvReport({events:[{source:'dataLayer',name:'old_event',page:'https://example.com',parameters:{},count:1}]});assert.ok(csv.includes('"platform"'));assert.ok(csv.includes('"dataLayer"'));
});
test('Mixpanel JSON, form, base64, GET, gzip and Unicode are decoded only on tracking hosts',()=>{
 const events=[{event:'Lihat produk ✓',properties:{token:'public-token',plan:'A',$current_url:'https://example.com/a'}}];
 for(const body of [JSON.stringify(events),new URLSearchParams({data:JSON.stringify(events)}).toString(),new URLSearchParams({data:Buffer.from(JSON.stringify(events)).toString('base64')}).toString()]){
  const [e]=parseVendorEvents('https://api-eu.mixpanel.com/track/',body);assert.equal(e.name,'Lihat produk ✓');assert.equal(e.platform,'mixpanel');assert.equal(e.parameters.plan,'A');assert.equal(e.parameters.token,undefined);
 }
 assert.equal(parseVendorEvents('https://api.mixpanel.com/track/?data='+encodeURIComponent(Buffer.from(JSON.stringify(events)).toString('base64')))[0].name,events[0].event);
 assert.equal(parseVendorEvents('https://api.mixpanel.com/track',gzipSync(JSON.stringify(events)),{'content-encoding':'gzip'})[0].name,events[0].event);
 assert.deepEqual(parseVendorEvents('https://notmixpanel.com/track',JSON.stringify(events)),[]);
 assert.deepEqual(parseVendorEvents('https://api.mixpanel.com/engage',JSON.stringify(events)),[]);
});
test('Braze custom-event batches and MoEngage compact/batch payloads preserve event properties',()=>{
 const [braze]=parseVendorEvents('https://sdk.iad-01.braze.com/api/v3/data',JSON.stringify({api_key:'public-sdk-key',events:[{name:'ce',time:123,data:{n:'Hero clicked',p:{placement:'hero'}}},{name:'ss',data:{}}]}));
 assert.equal(braze.name,'Hero clicked');assert.equal(braze.parameters.placement,'hero');assert.equal(braze.batch,true);assert.equal(braze.parameters.api_key,undefined);
 const [compact]=parseVendorEvents('https://sdk-01.moengage.com/v1/report/add',JSON.stringify({e:'Detail viewed',a:{plan:'B',URL:'https://example.com/a'}}));assert.equal(compact.parameters.plan,'B');assert.equal(compact.name,'Detail viewed');
 const [batch]=parseVendorEvents('https://sdk-02.moengage.com/v1/report/add',JSON.stringify({viewsCount:1,viewsInfo:[{EVENT_ACTION:'MOE_PAGE_VIEWED',EVENT_ATTRS:{URL:'https://example.com/a'}}]}));assert.equal(batch.name,'MOE_PAGE_VIEWED');assert.equal(batch.reportedPage,'https://example.com/a');assert.equal(batch.batch,true);
 assert.deepEqual(parseVendorEvents('https://sdk-01.moengage.com/v1/internal/sdks/metrics',JSON.stringify({metrics:[{name:'timing'}]})),[]);
 assert.equal(recognizedEventEndpoint('https://api.mixpanel.com/track'),'mixpanel');assert.equal(recognizedEventEndpoint('https://api.mixpanel.com.evil.test/track'),null);
 assert.ok(knownEmptyPayload('https://sdk.iad-01.braze.com/api/v3/data',JSON.stringify({api_key:'public-key',device_id:'fixture-device'})));
 assert.equal(knownEmptyPayload('https://sdk.iad-01.braze.com/api/v3/data','encrypted-or-unknown'),false);
});
test('browser observes the selected vendors on click, preserves SDK behavior, and handles aliases/named instances', {timeout:90000},async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/robots.txt'){res.end('User-agent: *');return;}if(req.url==='/sitemap.xml'){res.end('<urlset/>');return;}
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><title>Multi-platform fixture</title><script>
   window.dataLayer=[];function gtag(){dataLayer.push(arguments)};
   const send=(url,body)=>fetch(url,{method:'POST',body:JSON.stringify(body)}).catch(()=>{});
   window.Moengage={value:42,trackEvent(name,props){send('https://sdk-01.moengage.com/v1/report/add',{e:name,a:props});return this.value;},track_event(...args){return this.trackEvent(...args);}};
   window.braze={value:17,logCustomEvent(name,props){send('https://sdk.iad-01.braze.com/api/v3/data',{events:[{name:'ce',data:{n:name,p:props}}]});return this.value;}};
   const mpTrack=function(name,props){send('https://api.mixpanel.com/track',[{event:name,properties:{token:'public-token',...props}}]);return this.value;};
   window.mixpanel={value:8,track:mpTrack,init(token,config,name){return this[name]={value:9,track:mpTrack}}};const secondary=mixpanel.init('fake',{},'secondary');
   function run(){
    gtag('event','cta_ga4',{position:'hero'});fetch('/g/collect?v=2&tid=G-TEST&en=cta_ga4');dataLayer.push({event:'cta_layer',position:'hero'});
    const a=Moengage.track_event('cta_moe',{position:'hero'}),b=braze.logCustomEvent('cta_braze',{position:'hero'}),c=mixpanel.track('cta_mixpanel',{position:'hero'}),d=secondary.track('cta_named',{position:'hero'});
    if(a!==42||b!==17||c!==8||d!==9)throw Error('SDK return value or this binding changed');
    window.dispatchEvent(new CustomEvent('MOE_AUTOMATED_EVENTS',{detail:{name:'MOE_PAGE_VIEWED',data:{URL:location.href}}}));
   }
  </script></head><body><main><button id="cta" type="button" onclick="run()">Read details</button></main></body></html>`);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/`;
 try{
  const all=await audit({url,maxPages:1,maxElements:1,waitMs:500,concurrency:1});
  assert.equal(all.status,'completed',all.error);assert.equal(all.pages[0].runtimeErrors.length,0,all.pages[0].runtimeErrors.join());
  for(const platform of ['ga4','dataLayer','moengage','braze','mixpanel']){
   const e=all.events.find(e=>e.platform===platform);assert.ok(e,platform);assert.equal(e.action,'click');assert.equal(e.element.selector,'#cta');
  }
  for(const platform of ['moengage','braze','mixpanel'])assert.ok(all.events.some(e=>e.platform===platform&&e.source==='network'),platform+' network');
  const alias=all.events.find(e=>e.platform==='moengage'&&e.name==='cta_moe'&&e.source==='sdk');assert.equal(alias.count,1,'alias should not double-count nested trackEvent');
  const named=all.events.find(e=>e.name==='cta_named'&&e.source==='sdk');assert.equal(named.sdkInstance,'secondary');
  assert.ok(all.events.some(e=>e.apiMethod==='MOE_AUTOMATED_EVENTS'));
  const only=await audit({url,platforms:['braze'],maxPages:1,maxElements:1,waitMs:500});
  assert.ok(only.events.length>=2);assert.ok(only.events.every(e=>e.platform==='braze'));assert.deepEqual(only.options.platforms,['braze']);assert.equal(only.pages[0].runtimeErrors.length,0);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
