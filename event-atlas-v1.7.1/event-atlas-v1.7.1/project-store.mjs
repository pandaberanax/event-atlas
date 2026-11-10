import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {atomic} from './checkpoint.mjs';

const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
const fail=key=>Object.assign(Error(key),{status:400});
export function projectOrigin(value){
  try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error();return u.origin;}catch{throw fail('projectInvalidUrl');}
}
const sameSite=(a,b)=>{const x=new URL(a),y=new URL(b);return x.hostname.replace(/^www\./,'')===y.hostname.replace(/^www\./,'')&&x.port===y.port;};
export const projectRunKey=report=>createHash('sha256').update(String(report.projectId||'')+'\0'+(report.mode==='website-map'?'map':'audit')+'\0'+String(report.id)).digest('hex');

export function createProjectStore(root){
  let data={schemaVersion:1,activeId:null,projects:[]},chain=Promise.resolve(),dirty=false;
  const cached=new Map();
  const project=id=>data.projects.find(p=>p.id===id);
  async function flush(){
    chain=chain.catch(()=>{}).then(async()=>{
      if(!dirty)return;
      dirty=false;
      try{await fs.mkdir(root,{recursive:true});await atomic(path.join(root,'index.json'),data);}
      catch(error){dirty=true;throw error;}
    });
    return chain;
  }
  const timer=setInterval(()=>{if(dirty)void flush().catch(()=>{});},5000);timer.unref();
  function observe(report,{storage='history'}={}){
    const p=project(report.projectId);if(!p)return;
    if(!sameSite(p.root,report.root))throw fail('projectWrongSite');
    const key=projectRunKey(report),old=p.runs.find(r=>r.key===key);
    const entry={key,kind:report.mode==='website-map'?'map':'audit',reportId:String(report.id),root:report.root,
      status:report.status,appVersion:report.appVersion,startedAt:report.startedAt,updatedAt:new Date().toISOString(),
      urls:report.pages?.length||0,events:report.events?.length||0,storage};
    if(old)Object.assign(old,entry);else p.runs.push(entry);
    p.updatedAt=entry.updatedAt;p.revision=(p.revision||0)+1;dirty=true;
    return entry;
  }
  return {
    async restore(){
      try{const saved=JSON.parse(await fs.readFile(path.join(root,'index.json'),'utf8'));
        if(saved.schemaVersion!==1||!Array.isArray(saved.projects)||saved.projects.some(p=>!validId(p.id)||!Array.isArray(p.runs)))throw Error('projectInvalidData');
        for(const p of saved.projects)projectOrigin(p.root);
        data=saved;if(data.activeId&&!project(data.activeId))data.activeId=null;
      }catch(error){if(error.code!=='ENOENT')throw error;}
    },
    list:()=>({activeId:data.activeId,projects:data.projects.map(({runs,...p})=>({...p,scans:runs.filter(r=>r.kind==='map').length,audits:runs.filter(r=>r.kind==='audit').length}))}),
    get:project,
    get activeId(){return data.activeId;},
    async create({name,url}){
      const root=projectOrigin(url);
      if(typeof name!=='string'||!name.trim()||name.length>120)throw fail('projectInvalidName');
      const now=new Date().toISOString(),p={id:randomUUID(),name:name.trim(),root:root+'/',createdAt:now,updatedAt:now,revision:0,runs:[]};
      data.projects.push(p);data.activeId=p.id;dirty=true;await flush();return p;
    },
    async select(id){if(!project(id))throw fail('projectMissing');data.activeId=id;dirty=true;await flush();},
    async resolve(url,id){
      projectOrigin(url);
      if(id){const p=project(id);if(!p)throw fail('projectMissing');if(!sameSite(p.root,url))throw fail('projectWrongSite');return p;}
      const p=data.projects.find(p=>sameSite(p.root,url));
      if(p)return p;
      return this.create({name:new URL(url).hostname,url});
    },
    observe,
    async archive(report){
      const old=project(report.projectId)?.runs.find(r=>r.key===projectRunKey(report));
      if(report.mode==='website-map'&&old?.storage==='history'){observe(report);await flush();return;}
      const entry=observe(report,{storage:'archive'});if(!entry)return;
      entry.storage='archive';
      await fs.mkdir(root,{recursive:true});
      const copy=structuredClone(report);
      for(const page of copy.pages||[])delete page.elements;
      await atomic(path.join(root,entry.key+'.json'),copy);cached.set(entry.key,copy);
      if(cached.size>20)cached.delete(cached.keys().next().value);
      await flush();
    },
    async read(projectId,key,mapRead,live=[]){
      const entry=project(projectId)?.runs.find(r=>r.key===key);if(!entry)throw fail('projectMissing');
      const current=live.find(r=>r?.projectId===projectId&&projectRunKey(r)===key);if(current)return current;
      if(entry.storage==='history')return mapRead(entry.reportId);
      if(!/^[a-f0-9]{64}$/.test(key))throw fail('projectMissing');
      if(!cached.has(key)){cached.set(key,JSON.parse(await fs.readFile(path.join(root,key+'.json'),'utf8')));if(cached.size>20)cached.delete(cached.keys().next().value);}
      return cached.get(key);
    },
    async removeMap(id){
      for(const p of data.projects)for(const run of p.runs.filter(r=>r.kind==='map'&&r.reportId===id&&r.storage==='archive')){
        if(!/^[a-f0-9]{64}$/.test(run.key))throw fail('projectInvalidData');
        try{await fs.unlink(path.join(root,run.key+'.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
        cached.delete(run.key);
      }
      for(const p of data.projects){const next=p.runs.filter(r=>r.kind!=='map'||r.reportId!==id);if(next.length!==p.runs.length){p.runs=next;p.revision++;dirty=true;}}
      await flush();
    },
    flush,
    async close(){clearInterval(timer);await flush();}
  };
}
