import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {audit,saveReport,csvReport} from './auditor.mjs';
import {VERSION} from './dist/release.js';
import {selectedPlatforms} from './dist/platforms.js';
import {auditScope} from './dist/scope.js';
import {checkpointWriter,readCheckpoint,validateResume,pageComplete} from './checkpoint.mjs';
import {pageEvents} from './report-runtime.mjs';
import {auditTriggers} from './dist/triggers.js';
import {createManualLive} from './manual-live.mjs';
import {createAndroidAudit, handleAndroid} from './android-audit.mjs';
import {createWebsiteMap,websiteMapOptions} from './website-map.mjs';
import {createBrowserMapBridge} from './browser-map.mjs';
import {createProjectStore} from './project-store.mjs';
import {projectInventory,projectPageDetails,projectUrl} from './dist/project-model.js';
import {validateWebsiteMap} from './dist/website-map-model.js';
const dir = path.dirname(fileURLToPath(import.meta.url));
const token = randomBytes(24).toString('hex');
const manualLive = createManualLive(token);
const android = createAndroidAudit();
const reportRoot=process.env.EVENT_ATLAS_REPORT_DIR||path.join(dir,'reports');
const projects=createProjectStore(path.join(reportRoot,'projects'));
await projects.restore();
const websiteMap = createWebsiteMap(path.join(reportRoot,'website-map'),{
  onUpdate:report=>projects.observe(report),onFinish:async report=>{projects.observe(report);await projects.flush();}
});
await websiteMap.restore();
const checkpointRoot=path.join(reportRoot,'checkpoints');
let report=null, active=false, controller,writer;
const browserMap=createBrowserMapBridge({
  isBusy:()=>active||websiteMap.active,
  isCurrent:target=>projects.activeId===target.options.projectId,
  prepare:async input=>{
    if(!input.projectId&&!projects.activeId)throw Object.assign(Error('mapBrowserProjectRequired'),{status:400});
    const options=websiteMapOptions({...input,method:'browser'}),p=await projects.resolve(options.url,input.projectId||projects.activeId);
    if(input.report){validateWebsiteMap(input.report);if(new URL(input.report.root).origin!==new URL(options.url).origin)throw Object.assign(Error('mapBrowserWrongSite'),{status:400});}
    if(input.report?.projectId&&input.report.projectId!==p.id)throw Object.assign(Error('projectWrongSite'),{status:400});
    return {options:{...options,projectId:p.id,browserSessionStartedAt:new Date().toISOString()},report:input.report};
  },
  onCapture:async(target,snapshot)=>{
    const next=await websiteMap.mergeBrowser(target.options,snapshot,target.report);target.report=next;return next.pages.length;
  }
});
try{report=await readCheckpoint(checkpointRoot);}catch{}
// Adopt existing results by site without changing their original engine versions.
for(const old of [websiteMap.report,report].filter(Boolean)){
  const p=await projects.resolve(old.root,projects.get(old.projectId)?old.projectId:undefined);
  old.projectId=p.id;
  if(old.mode==='website-map')projects.observe(old);else await projects.archive(old);
}
for(const entry of websiteMap.history()){
  if(projects.list().projects.some(p=>projects.get(p.id).runs.some(r=>r.kind==='map'&&r.reportId===entry.id)))continue;
  try{const old=await websiteMap.read(entry.id);const p=await projects.resolve(old.root);old.projectId=p.id;projects.observe(old);}catch{}
}
await projects.flush();
if(!projects.activeId&&projects.list().projects[0])await projects.select(projects.list().projects[0].id);
async function sources(id){
  const p=projects.get(id);if(!p)throw Object.assign(Error('projectMissing'),{status:404});
  const out=[];
  for(const run of p.runs){
    try{out.push({key:run.key,report:await projects.read(id,run.key,websiteMap.read,[report,websiteMap.report])});}
    catch{out.push({key:run.key,missing:true});}
  }
  return out;
}
async function mapForProject(id){
  if(!id)return websiteMap.report;
  if(websiteMap.report?.projectId===id)return websiteMap.report;
  const last=projects.get(id)?.runs.filter(r=>r.kind==='map').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
  if(!last)return null;
  try{return await projects.read(id,last.key,websiteMap.read);}catch{return null;}
}
async function bodyJson(req,limit=64*1024*1024){
  let body='';for await(const chunk of req){body+=chunk;if(body.length>limit)throw Object.assign(Error('projectInvalidData'),{status:413});}
  return JSON.parse(body);
}
const server=http.createServer(async(req,res)=>{
  const requestUrl=new URL(req.url,'http://localhost');
  const pathname=requestUrl.pathname;
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if (!['localhost','127.0.0.1'].includes(String(req.headers.host || '').split(':')[0])) return json(403,{error:'Host tidak diizinkan'});
  if (await manualLive(req, res, requestUrl, json)) return;
  if (await browserMap.handle(req,res,requestUrl,json)) return;
  // Mutations only from the local app; no wildcard CORS or unauthenticated cloud bridge.
  if (req.method==='POST') {
    if (req.headers['x-atlas-token']!==token) return json(403,{error:'Buka ulang aplikasi lokal untuk mendapatkan sesi yang valid.'});
    if (req.headers.origin && ![`http://localhost:${server.address().port}`,`http://127.0.0.1:${server.address().port}`].includes(req.headers.origin)) return json(403,{error:'Origin tidak diizinkan'});
  }
  if(pathname.startsWith('/api/projects/')){
    if(req.headers['x-atlas-token']!==token)return json(403,{error:'mapLocalRequired'});
    try{
      const action=pathname.slice('/api/projects/'.length),id=requestUrl.searchParams.get('id')||projects.activeId;
      if(req.method==='GET'){
        if(action==='status')return json(200,{...projects.list(),busy:active||websiteMap.active});
        if(action==='report')return json(200,{report:await projects.read(id,requestUrl.searchParams.get('key'),websiteMap.read,[report,websiteMap.report])});
        if(action==='inventory'||action==='page'){
          const all=await sources(id),available=all.filter(s=>s.report),missing=all.filter(s=>s.missing).length;
          if(action==='inventory')return json(200,{project:projects.get(id),pages:projectInventory(available),missing});
          const url=projectUrl(requestUrl.searchParams.get('url'));if(!url)throw Error('projectInvalidUrl');
          return json(200,{...projectPageDetails(available,url),missing});
        }
      }
      if(req.method==='POST'){
        if(active||websiteMap.active)return json(409,{error:'projectBusy'});
        const body=await bodyJson(req);
        if(action==='create'){await projects.create(body);return json(200,projects.list());}
        if(action==='select'){await projects.select(body.id);return json(200,projects.list());}
        if(action==='attach'){
          const value=body.report;
          if(value?.schemaVersion!==1||typeof value.id!=='string'||!Array.isArray(value.pages)||value.pages.length>10000||value.events&&!Array.isArray(value.events))throw Error('projectInvalidData');
          if(value.mode==='android')throw Error('projectWebOnly');
          const p=await projects.resolve(value.root,body.projectId||projects.activeId);
          value.projectId=p.id;await projects.archive(value);return json(200,{projectId:p.id});
        }
      }
      return json(404,{error:'projectMissing'});
    }catch(error){return json(error.status||400,{error:error.status?error.message:['projectMissing','projectInvalidUrl','projectWebOnly','projectInvalidData'].includes(error.message)?error.message:'projectStorageError'});}
  }
  if (pathname.startsWith('/api/android/')) {
    if (req.headers['x-atlas-token']!==token) return json(403,{error:'androidForbidden'});
    return handleAndroid(android,req,requestUrl,json);
  }
  if (pathname.startsWith('/api/website-map/')) {
    if (req.headers['x-atlas-token']!==token) return json(403,{error:'mapLocalRequired'});
    if (req.method==='GET' && pathname==='/api/website-map/status') {
      const id=requestUrl.searchParams.get('projectId')||projects.activeId;
      const current=await mapForProject(id);
      const ids=new Set(projects.get(id)?.runs.filter(r=>r.kind==='map'&&r.storage==='history').map(r=>r.reportId)||[]);
      const history=websiteMap.history().filter(r=>!id||ids.has(r.id));
      if(current&&requestUrl.searchParams.get('reportId')===current.id&&requestUrl.searchParams.get('dataRevision')===String(current.dataRevision??current.revision)){
        return json(200,{active:websiteMap.active,unchanged:true,meta:{revision:current.revision,durationMs:current.durationMs,checkpoint:current.checkpoint},history,warning:websiteMap.warning});
      }
      return json(200,{active:websiteMap.active,report:current || null,history,warning:websiteMap.warning});
    }
    if(req.method==='POST'&&pathname==='/api/website-map/browser/prepare'){
      try{return json(200,await browserMap.prepare(await bodyJson(req)));}
      catch(error){return json(error.status||400,{error:error.status?error.message:'mapInvalidBrowserLinks'});}
    }
    if(req.method==='GET' && pathname==='/api/website-map/report'){
      try{return json(200,{report:await websiteMap.read(requestUrl.searchParams.get('id'))});}
      catch{return json(404,{error:'mapRestoreError'});}
    }
    if (req.method==='POST' && pathname==='/api/website-map/stop') {websiteMap.stop();return json(200,{ok:true});}
    if(req.method==='POST'&&pathname==='/api/website-map/delete'){
      try{const body=await bodyJson(req,4096);await websiteMap.remove(body.id);await projects.removeMap(body.id);return json(200,{ok:true});}
      catch(error){return json(error.status||400,{error:error.status?error.message:'mapDeleteError'});}
    }
    if (req.method==='POST' && ['/api/website-map/start','/api/website-map/resume'].includes(pathname)) {
      if (active) return json(409,{error:'mapAuditBusy'});
      try {
        let body='';
        const limit=pathname.endsWith('/resume')?64*1024*1024:16384;
        for await (const chunk of req) {body+=chunk;if(body.length>limit)return json(413,{error:'mapInvalidReport'});}
        const input=JSON.parse(body);
        const p=await projects.resolve(input.report?.root||input.url,input.report?.projectId||input.projectId||projects.activeId);
        if(pathname.endsWith('/resume')){input.report.projectId=p.id;websiteMap.resume(input);}
        else websiteMap.start({...input,projectId:p.id});
        return json(202,{ok:true});
      } catch (error) {return json(error.status||400,{error:error.status?error.message:'mapInvalidUrl'});}
    }
    return json(404,{error:'mapInvalidUrl'});
  }
  if (pathname==='/api/status') {
    const projectId=requestUrl.searchParams.get('projectId');
    if(projectId&&report?.projectId!==projectId)return json(200,{local:true,version:VERSION,active,report:null,token});
    if(report && requestUrl.searchParams.get('reportId')===report.id){
      const since=Math.max(0,Number(requestUrl.searchParams.get('revision')) || 0);
      const pageIndexes=report.pages.flatMap((p,i)=>p.revision>since||p.status==='loading'?[i]:[]);
      const eventPages=pageIndexes.map(i=>report.pages[i].url);
      return json(200,{local:true,version:VERSION,active,token,patch:{pageIndexes,eventPages},report:{...report,pages:pageIndexes.map(i=>report.pages[i]),events:eventPages.flatMap(url=>pageEvents(report,url))}});
    }
    return json(200,{local:true,version:VERSION,active,report,token});
  }
  if (pathname==='/api/stop' && req.method==='POST') {controller?.abort();return json(200,{ok:true});}
  if ((pathname==='/api/audit'||pathname==='/api/resume') && req.method==='POST') {
    if(active||websiteMap.active)return json(409,{error:'mapAuditBusy'});
    try {
      let body='';for await(const chunk of req){body+=chunk;if(body.length>270*1024*1024)return json(413,{error:'Request terlalu besar'});}
      const options=JSON.parse(body);
      if(pathname==='/api/resume'){options.resume=validateResume(options.resume||report);options.url=options.resume.root;options.platforms=options.resume.options.platforms;options.scope=options.resume.options.scope;const limit=options.scope==='single'?1:Number(options.maxPages||options.resume.options.maxPages);if(limit<=options.resume.pages.filter(pageComplete).length)return json(400,{error:'Naikkan batas halaman untuk melanjutkan audit ini.'});}
      const u=new URL(options.url);
      options.platforms=selectedPlatforms(options.platforms);
      options.scope=auditScope(options.scope);
      auditTriggers(options.resume ? options.resume.options.triggers : options.triggers);
      if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return json(400,{error:'URL tidak valid'});
      const p=await projects.resolve(options.url,options.resume?.projectId||options.projectId||projects.activeId);
      if(active||websiteMap.active)return json(409,{error:'mapAuditBusy'});
      active=true;controller=new AbortController();report=null;writer=checkpointWriter(checkpointRoot);
      json(202,{ok:true});
      const previous=options.resume;
      audit(options,r=>{r.projectId=p.id;report=r;writer.observe(r);projects.observe(r,{storage:'archive'});},controller.signal).then(async r=>{report=r;await writer.finish(r);await saveReport(r,path.join(reportRoot,'latest'));await projects.archive(r);}).catch(async err=>{if(!report&&previous)report=previous;if(report){report.status='error';report.error=err.message;try{await projects.archive(report);}catch{}}else report={status:'error',error:err.message,pages:[],events:[],summary:{}};writer.close();}).finally(()=>{active=false;});
    }catch(err){active=false;json(400,{error:err.message});}return;
  }
  if(pathname==='/api/export.json'&&report)return json(200,report);
  if(pathname==='/api/export.csv'&&report){res.writeHead(200,{'Content-Type':'text/csv;charset=utf-8','Content-Disposition':'attachment;filename="events.csv"'});res.end(csvReport(report));return;}
  try{
    const name=pathname==='/'?'index.html':decodeURIComponent(pathname).replace(/^\//,'');
    const target=path.resolve(dir,'dist',name);
    if(!target.startsWith(path.resolve(dir,'dist')+path.sep))return json(403,{error:'Forbidden'});
    const ext=path.extname(target);const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.zip':'application/zip'}[ext]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff'});res.end(await fs.readFile(target));
  }catch{if(!res.headersSent)res.writeHead(404);res.end('Not found');}
});
const bindHost = process.env.EVENT_ATLAS_DOCKER === '1' ? '0.0.0.0' : '127.0.0.1';
server.listen(Number(process.env.PORT)||4318,bindHost,()=>console.log(`Event Atlas siap: http://127.0.0.1:${server.address().port}`));
for (const name of ['SIGINT','SIGTERM']) process.once(name, () => {
  controller?.abort();
  Promise.allSettled([writer?.flush(),android.shutdown(),websiteMap.shutdown()]).then(()=>projects.close()).finally(() => server.close());
  setTimeout(() => process.exit(),10000).unref();
});
