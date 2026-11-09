import fs from 'node:fs/promises';
import path from 'node:path';
import {atomic} from './checkpoint.mjs';
import {validateWebsiteMap} from './dist/website-map-model.js';

const validId=id=>typeof id==='string' && /^[a-f0-9-]{36}$/.test(id);
const summary=report=>({id:report.id,root:report.root,appVersion:report.appVersion,status:report.status,
  startedAt:report.startedAt,finishedAt:report.finishedAt,savedAt:report.checkpoint?.savedAt,urls:report.pages.length});

export function createWebsiteMapStore(root,{intervalMs=5000}={}) {
  let entries=[];
  let latest;
  let chain=Promise.resolve();
  let timer;

  async function read(id) {
    if(!validId(id))throw Error('mapInvalidReport');
    const file=path.join(root,id+'.json');
    if((await fs.stat(file)).size>40*1024*1024)throw Error('mapInvalidReport');
    const report=validateWebsiteMap(JSON.parse(await fs.readFile(file,'utf8')));
    if(report.id!==id)throw Error('mapInvalidReport');
    if(report.status==='running'){
      report.status='interrupted';
      report.finishedAt=report.checkpoint?.savedAt;
      for(const row of report.pages)if(row.status==='loading')row.status='discovered';
    }
    return report;
  }
  function flush() {
    chain=chain.then(async()=>{
      if(!latest)return;
      const current=latest;
      const report=structuredClone(current);
      if(report.status==='running'&&report.sessionStartedAt)report.durationMs=(report.previousDurationMs||0)+Date.now()-Date.parse(report.sessionStartedAt);
      report.checkpoint={savedAt:new Date().toISOString()};
      await fs.mkdir(root,{recursive:true});
      await atomic(path.join(root,report.id+'.json'),report);
      const next=[summary(report),...entries.filter(item=>item.id!==report.id)].slice(0,20);
      await atomic(path.join(root,'index.json'),{entries:next});
      entries=next;
      current.checkpoint=report.checkpoint;
      current.revision=(current.revision||0)+1;
    }).catch(failure=>{
      if(latest){latest.checkpoint={...latest.checkpoint,error:failure.message};latest.revision=(latest.revision||0)+1;}
    });
    return chain;
  }
  return {
    async restore(){
      try{
        const index=JSON.parse(await fs.readFile(path.join(root,'index.json'),'utf8'));
        entries=Array.isArray(index.entries)?index.entries.filter(item=>validId(item.id)).slice(0,20):[];
        if(entries[0])latest=await read(entries[0].id);
      }catch(failure){if(failure.code!=='ENOENT')throw failure;}
      return latest;
    },
    list:()=>entries,
    read,
    begin(report){
      latest=report;
      clearInterval(timer);
      timer=setInterval(()=>void flush(),intervalMs);timer.unref();
      void flush();
    },
    observe(report){latest=report;},
    async finish(report){latest=report;clearInterval(timer);await flush();},
    flush
  };
}
