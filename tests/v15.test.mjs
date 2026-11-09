import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {audit} from '../auditor.mjs';
import {probeOutcome} from '../dist/triggers.js';

async function serve(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  return {
    url: 'http://127.0.0.1:'+server.address().port,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

test('selected triggers capture impression and guarded actions without delivery or logout', {timeout:45000}, async () => {
  const requests = [];
  const external = await serve((req,res) => {requests.push(req.url);res.end('external');});
  const site = await serve((req,res) => {
    if (req.url==='/robots.txt') {res.end('User-agent: *');return;}
    if (req.url==='/sitemap.xml') {res.end('<urlset/>');return;}
    if (req.url!=='/') {requests.push(req.url);res.end('unexpected');return;}
    res.setHeader('Content-Type','text/html');
    res.end(`<!doctype html>
      <script>window.dataLayer=[{event:'load_fixture'}]</script>
      <button id="ordinary" onclick="dataLayer.push({event:'unselected_click'})">Ordinary</button>
      <a id="outbound" href="${external.url}/external" onclick="dataLayer.push({event:'out_fixture'});fetch('/unexpected_get').catch(()=>{})">External</a>
      <a id="logout" href="/logout" onclick="dataLayer.push({event:'should_not_logout'})">Logout</a>
      <form action="/send" method="get" onsubmit="dataLayer.push({event:'submit_fixture'});fetch('/submit_get').catch(()=>{});setTimeout(()=>fetch('/delayed_get').catch(()=>{}),700)">
        <button id="send">Kirim</button>
      </form>
      <form action="/invalid" onsubmit="dataLayer.push({event:'invalid_submit'})">
        <input required name="email"><button id="invalid">Send</button>
      </form>
      <div style="height:1600px"></div>
      <article id="impression" data-impression>Example product</article>
      <script>new IntersectionObserver((entries,observer)=>{
        for (const entry of entries) if(entry.isIntersecting) {
          dataLayer.push({event:'impression_fixture'});
          observer.unobserve(entry.target);
        }
      }).observe(document.querySelector('#impression'));</script>`);
  });
  try {
    const report = await audit({url:site.url,maxPages:2,maxElements:6,waitMs:500,concurrency:1,platforms:['dataLayer'],triggers:['impression','outbound','form_submit','authentication']});
    assert.equal(report.status,'completed',report.error);
    assert.deepEqual(requests,[]);
    assert.deepEqual(report.events.map(e=>[e.name,e.trigger,e.element?.selector]).sort(),[
      ['impression_fixture','impression','#impression'],
      ['out_fixture','outbound','#outbound'],
      ['submit_fixture','form_submit','#send'],
    ]);
    const root = report.pages[0];
    const actions = new Map(root.actions.map(action=>[action.element.selector,action]));
    assert.equal(actions.get('#outbound').blockedNavigations[0].url,external.url+'/external');
    assert.equal(actions.get('#send').submitObserved,true);
    assert.equal(actions.get('#invalid').submitObserved,undefined);
    assert.equal(probeOutcome(actions.get('#invalid'),0),'probeNoEvent');
    assert.equal(probeOutcome(actions.get('#logout'),0),'probeManual');
    assert.equal(probeOutcome(actions.get('#ordinary'),0),'probeSkipped');
    assert.equal(root.probes.find(p=>p.element?.selector==='#impression').status,'tested');
    assert.equal(report.pages[1].status,'skipped');
  } finally {
    await site.close();
    await external.close();
  }
});

test('Express uses four workers and matches Fast evidence at the same observation window', {timeout:60000}, async t => {
  const paths = Array.from({length:12},(_,i)=>'/page-'+i);
  const site = await serve((req,res) => {
    if (req.url==='/robots.txt') {res.end('User-agent: *');return;}
    if (req.url==='/sitemap.xml') {
      res.end('<urlset>'+paths.map(path=>'<url><loc>'+site.url+path+'</loc></url>').join('')+'</urlset>');
      return;
    }
    res.setHeader('Content-Type','text/html');
    setTimeout(()=>res.end('<script>window.dataLayer=[{event:"page_fixture",path:location.pathname}]</script>'),400);
  });
  try {
    const run = async speed => {
      let peak = 0;
      const report = await audit({url:site.url+paths[0],maxPages:12,maxElements:6,platforms:['dataLayer'],triggers:['page_load'],speed}, progress => {
        peak = Math.max(peak,progress.summary.activeUrls.length);
      });
      assert.equal(report.status,'completed',report.error);
      assert.equal(report.pages.length,12);
      assert.equal(report.events.length,12);
      assert.equal(report.options.waitMs,900);
      return {report, peak};
    };
    const fast = await run('fast');
    const express = await run('express');
    const evidence = ({report})=>report.events.map(e=>JSON.stringify([e.page,e.trigger,e.name,e.parameters])).sort();
    assert.equal(fast.peak,3);
    assert.equal(express.peak,4);
    assert.deepEqual(evidence(fast),evidence(express));
    t.diagnostic(JSON.stringify({fastMs:fast.report.durationMs,expressMs:express.report.durationMs,pages:12,observations:12}));
  } finally {
    await site.close();
  }
});
