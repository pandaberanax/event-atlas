import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {audit} from '../auditor.mjs';
import {fixture} from './performance.fixture.mjs';
const results=[];let baseline;
for(const config of [{name:'isolated-cache-off',resetPolicy:'isolated',assetCache:false},{name:'isolated-cache-on',resetPolicy:'isolated',assetCache:true},{name:'experimental-reuse-cache-on',resetPolicy:'smart',assetCache:true}]){
 const f=await fixture();try{
  const r=await audit({url:f.url,maxPages:1,maxElements:4,concurrency:1,waitMs:500,...config});
  const identity=r.events.map(e=>JSON.stringify([e.platform,e.source,e.name,e.eventCategory,e.relationship,e.element?.selector||'',new URL(e.eventPage).pathname,e.parameters.feature||''])).sort();
  if(!baseline)baseline=identity;else assert.deepEqual(identity,baseline,'Event and location parity must hold on the fixture');
  assert.equal(r.status,'limited');assert.equal(r.summary.testedElements,4);assert.equal(f.hits.analytics,0);assert.equal(f.hits.mutations,0);
  results.push({mode:config.name,durationMs:r.durationMs,observations:r.events.length,tested:r.summary.testedElements,performance:r.performance,requests:f.hits});
 }finally{await f.close();}
}
const result={version:'1.4.0',measuredAt:new Date().toISOString(),scope:'Controlled local fixture; one origin page, 4 clicks, 500ms observation windows, one worker, 400ms artificial public-script delay. Not a Sequis or real-world speed guarantee.',eventLocationParity:true,results};
await fs.mkdir(new URL('../reports/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../reports/benchmark-v1.4.0.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
