import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createWebsiteMapStore} from '../website-map-store.mjs';
import {checkpointWriter} from '../checkpoint.mjs';

test('server migrates legacy map history and audit checkpoints, enforces project access and persists scan deletion',{timeout:20000},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-project-migration-'));
  const mapStore=createWebsiteMapStore(path.join(directory,'website-map'));
  const createMap=root=>({id:randomUUID(),schemaVersion:1,mode:'website-map',appVersion:'1.6.0',root,
    status:'completed',revision:1,startedAt:'2026-11-01T00:00:00Z',finishedAt:'2026-11-01T00:01:00Z',durationMs:60000,
    options:{maxPages:100,concurrency:3},pages:[{url:root,title:'Legacy',status:'ok',httpStatus:200}],warnings:[]});
  const a=createMap('https://example.com/'),b=createMap('https://other.example/');
  mapStore.begin(a);await mapStore.finish(a);mapStore.begin(b);await mapStore.finish(b);
  const audit={schemaVersion:1,id:'legacy-audit',appVersion:'1.6.0',root:a.root,status:'completed',startedAt:a.startedAt,finishedAt:a.finishedAt,
    options:{platforms:['dataLayer'],scope:'single',maxPages:1},summary:{visited:1},discovery:{urls:[a.root]},
    pages:[{url:a.root,title:'Legacy audit',revision:1,status:'ok',httpStatus:200,actions:[]}],events:[{id:'ev-1',name:'legacy_event',source:'dataLayer',platform:'dataLayer',page:a.root,parameters:{preserved:'yes'}}]};
  const writer=checkpointWriter(path.join(directory,'checkpoints'));writer.observe(audit);await writer.finish(audit);
  const probe=http.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const base='http://127.0.0.1:'+port;let child,token,log='';
  async function start(){
    child=spawn(process.execPath,['server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),windowsHide:true,env:{...process.env,PORT:String(port),EVENT_ATLAS_REPORT_DIR:directory},stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
    for(let i=0;i<80;i++){try{const r=await fetch(base+'/api/status');if(r.ok){token=(await r.json()).token;return;}}catch{}await delay(60);}throw Error(log);
  }
  async function stop(){if(child?.exitCode===null){const done=once(child,'exit');child.kill();await done;}}
  async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'X-Atlas-Token':token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
  try{
    await start();assert.equal((await fetch(base+'/api/projects/status')).status,403);
    const status=await api('/api/projects/status');assert.equal(status.projects.length,2);
    const p=status.projects.find(p=>p.root===a.root),q=status.projects.find(p=>p.root===b.root);
    assert.equal(p.audits,1);assert.equal(p.scans,1);assert.equal(q.scans,1);
    const inventory=await api('/api/projects/inventory?id='+p.id);assert.equal(inventory.pages[0].events,1);
    const key=inventory.project.runs.find(r=>r.kind==='audit').key;
    const legacy=(await api('/api/projects/report?'+new URLSearchParams({id:p.id,key}))).report;
    assert.equal(legacy.appVersion,'1.6.0');assert.deepEqual(legacy.events[0].parameters,{preserved:'yes'});
    assert.equal((await api('/api/website-map/status?projectId='+p.id)).history[0].id,a.id);
    assert.equal((await fetch(base+'/api/projects/select',{method:'POST',headers:{'X-Atlas-Token':token,Origin:'https://unrelated.example','Content-Type':'application/json'},body:JSON.stringify({id:q.id})})).status,403);
    await api('/api/projects/select',{id:p.id});await api('/api/website-map/delete',{id:a.id});
    await stop();await start();
    assert.equal((await api('/api/projects/status')).activeId,p.id);
    assert.equal((await api('/api/website-map/status?projectId='+p.id)).history.length,0);
    const after=await api('/api/projects/inventory?id='+p.id);assert.equal(after.project.runs.length,1);assert.equal(after.project.runs[0].kind,'audit');
    assert.equal((await api('/api/website-map/status?projectId='+q.id)).history[0].id,b.id);
  }finally{await stop();await fs.rm(directory,{recursive:true,force:true});}
});
