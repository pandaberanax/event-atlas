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
import {createWebsiteMap} from './website-map.mjs';
const dir = path.dirname(fileURLToPath(import.meta.url));
const token = randomBytes(24).toString('hex');
const manualLive = createManualLive(token);
const android = createAndroidAudit();
const reportRoot=process.env.EVENT_ATLAS_REPORT_DIR||path.join(dir,'reports');
const websiteMap = createWebsiteMap(path.join(reportRoot,'website-map'));
await websiteMap.restore();
const checkpointRoot=path.join(reportRoot,'checkpoints');
let report=null, active=false, controller,writer;
try{report=await readCheckpoint(checkpointRoot);}catch{}
const server=http.createServer(async(req,res)=>{
  const requestUrl=new URL(req.url,'http://localhost');
  const pathname=requestUrl.pathname;
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if (!['localhost','127.0.0.1'].includes(String(req.headers.host || '').split(':')[0])) return json(403,{error:'Host tidak diizinkan'});
  if (await manualLive(req, res, requestUrl, json)) return;
  // Mutations only from the local app; no wildcard CORS or unauthenticated cloud bridge.
  if (req.method==='POST') {
    if (req.headers['x-atlas-token']!==token) return json(403,{error:'Buka ulang aplikasi lokal untuk mendapatkan sesi yang valid.'});
    if (req.headers.origin && ![`http://localhost:${server.address().port}`,`http://127.0.0.1:${server.address().port}`].includes(req.headers.origin)) return json(403,{error:'Origin tidak diizinkan'});
  }
  if (pathname.startsWith('/api/android/')) {
    if (req.headers['x-atlas-token']!==token) return json(403,{error:'androidForbidden'});
    return handleAndroid(android,req,requestUrl,json);
  }
  if (pathname.startsWith('/api/website-map/')) {
    if (req.headers['x-atlas-token']!==token) return json(403,{error:'mapLocalRequired'});
    if (req.method==='GET' && pathname==='/api/website-map/status') {
      return json(200,{active:websiteMap.active,report:websiteMap.report || null,history:websiteMap.history(),warning:websiteMap.warning});
    }
    if(req.method==='GET' && pathname==='/api/website-map/report'){
      try{return json(200,{report:await websiteMap.read(requestUrl.searchParams.get('id'))});}
      catch{return json(404,{error:'mapRestoreError'});}
    }
    if (req.method==='POST' && pathname==='/api/website-map/stop') {websiteMap.stop();return json(200,{ok:true});}
    if (req.method==='POST' && ['/api/website-map/start','/api/website-map/resume'].includes(pathname)) {
      if (active) return json(409,{error:'mapAuditBusy'});
      try {
        let body='';
        const limit=pathname.endsWith('/resume')?64*1024*1024:16384;
        for await (const chunk of req) {body+=chunk;if(body.length>limit)return json(413,{error:'mapInvalidReport'});}
        if(pathname.endsWith('/resume'))websiteMap.resume(JSON.parse(body));
        else websiteMap.start(JSON.parse(body));
        return json(202,{ok:true});
      } catch (error) {return json(error.status||400,{error:error.status?error.message:'mapInvalidUrl'});}
    }
    return json(404,{error:'mapInvalidUrl'});
  }
  if (pathname==='/api/status') {
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
      active=true;controller=new AbortController();report=null;writer=checkpointWriter(checkpointRoot);
      json(202,{ok:true});
      const previous=options.resume;
      audit(options,r=>{report=r;writer.observe(r);},controller.signal).then(async r=>{report=r;await writer.finish(r);await saveReport(r,path.join(reportRoot,'latest'));}).catch(err=>{if(!report&&previous)report=previous;if(report){report.status='error';report.error=err.message;}else report={status:'error',error:err.message,pages:[],events:[],summary:{}};writer.close();}).finally(()=>{active=false;});
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
  Promise.allSettled([writer?.flush(),android.shutdown(),websiteMap.shutdown()]).finally(() => server.close());
  setTimeout(() => process.exit(),10000).unref();
});
