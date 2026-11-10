import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pageEvents} from './report-runtime.mjs';
import {elapsedMs} from './dist/model.js';
import {completePage} from './dist/event-model.js';
export async function atomic(file,data){const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(data));await fs.rename(tmp,file);}
export function checkpointWriter(root,{intervalMs=15000}={}){
 const run=randomUUID(),dir=path.join(root,run),revisions=new Map();let latest,chain=Promise.resolve(),last=0;
 const flush=()=>{chain=chain.then(async()=>{
  const report=latest;if(!report)return;await fs.mkdir(dir,{recursive:true});
  for(let i=0;i<report.pages.length;i++){const p=report.pages[i];if(revisions.get(p.url)===p.revision&&p.status!=='loading')continue;const revision=p.revision;const page={...p};delete page.elements;await atomic(path.join(dir,i+'.json'),{page,events:pageEvents(report,p.url)});revisions.set(p.url,revision);}
  const {pages,events,...metadata}=report;const savedAt=new Date().toISOString();metadata.durationMs=elapsedMs(report);metadata.checkpoint={savedAt,pageCount:pages.length};
  await atomic(path.join(dir,'manifest.json'),{metadata,pageFiles:pages.map((_,i)=>i+'.json')});await atomic(path.join(root,'latest.json'),{run});last=Date.now();report.checkpoint={savedAt,pageCount:pages.length};
 }).catch(err=>{if(latest)latest.checkpoint={...latest.checkpoint,error:err.message};});return chain;};
 const timer=setInterval(()=>{if(latest&&Date.now()-last>=intervalMs)flush();},intervalMs);timer.unref();
 return {observe(report){latest=report;},async finish(report){latest=report;clearInterval(timer);await flush();},flush,close(){clearInterval(timer);}};
}
export async function readCheckpoint(root){
 const {run}=JSON.parse(await fs.readFile(path.join(root,'latest.json'),'utf8'));if(!/^[a-f0-9-]{36}$/.test(run))throw Error('Checkpoint tidak valid.');
 const dir=path.join(root,run),{metadata,pageFiles}=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
 const pages=[],events=[];for(const file of pageFiles){if(!/^\d+\.json$/.test(file))throw Error('Checkpoint tidak valid.');const saved=JSON.parse(await fs.readFile(path.join(dir,file),'utf8'));pages.push(saved.page);events.push(...saved.events);}
 const report={...metadata,pages,events};if(report.status==='running'){report.status='interrupted';report.finishedAt=metadata.checkpoint.savedAt;}return report;
}
export function validateResume(report){
 if(report?.mode==='manual'||report?.schemaVersion!==1||!report.root||!Array.isArray(report.pages)||!Array.isArray(report.events)||!report.options||!Array.isArray(report.discovery?.urls))throw Error('Laporan ini tidak memiliki antrean URL untuk dilanjutkan.');
 return report;
}
export const pageComplete=completePage;
