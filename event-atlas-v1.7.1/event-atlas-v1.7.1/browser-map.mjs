import {randomBytes,randomUUID} from 'node:crypto';
import {discoveryUrl as mapUrl,pathWithin,pathDepth,validateWebsiteMap} from './dist/website-map-model.js';
import {VERSION} from './dist/release.js';
const fail=(key,status=400)=>Object.assign(Error(key),{status});
export function mergeBrowserMap(options,snapshot,previous){
  if(snapshot.accessIssue)throw fail('pageVerificationRequired');
  const page=mapUrl(snapshot.page,undefined,options.keepQuery),origin=new URL(options.url).origin;
  if(!page||new URL(page).origin!==origin)throw fail('mapBrowserWrongSite');
  function allowed(url){const u=new URL(url);return u.origin===origin&&pathWithin(u.pathname,options.includePath)&&
    !options.excludePaths.some(p=>pathWithin(u.pathname,p))&&(options.maxScanDepth===null||pathDepth(url)<=options.maxScanDepth);}
  if(!allowed(page))throw fail('mapBrowserOutsideScope');
  if(!Array.isArray(snapshot.links)||snapshot.links.length>10000||typeof snapshot.title!=='string'||snapshot.title.length>2000)throw fail('mapInvalidBrowserLinks');
  const now=new Date().toISOString();
  if(previous){
    const scope=opts=>JSON.stringify([opts?.scope||'site',opts?.includePath||'/',opts?.excludePaths||[],opts?.maxScanDepth??null,!!opts?.keepQuery]);
    if(scope(previous.options)!==scope(options))previous=undefined;
  }
  const report=previous?structuredClone(validateWebsiteMap(previous)):{schemaVersion:1,mode:'website-map',id:randomUUID(),root:options.url,
    startedAt:now,pages:[],sitemaps:[],warnings:[],revision:0,durationMs:0};
  if(new URL(report.root).origin!==origin)throw fail('mapBrowserWrongSite');
  if(previous){for(const row of report.pages)row.provenanceVersion ||= previous.appVersion;
    if(!previous.browserCapture)report.resumedFrom={id:previous.id,appVersion:previous.appVersion};}
  report.appVersion=VERSION;report.projectId=options.projectId;report.options={...options,method:'browser',rendered:true};
  const rows=new Map(report.pages.map(row=>[row.url,row]));let limited=false;
  function add(value,isPage=false){
    if(typeof value!=='string'||value.length>4096)return;
    const url=mapUrl(value,page,options.keepQuery);if(!url||!allowed(url))return;
    let row=rows.get(url);
    if(!row){if(rows.size>=options.maxPages){limited=true;return;}row={url,title:'',status:'discovered',httpStatus:null,source:'browser',foundOn:page,provenanceVersion:VERSION};rows.set(url,row);report.pages.push(row);}
    if(isPage){row.title=snapshot.title;row.status='ok';row.httpStatus=null;row.finalUrl=page;row.inspectionMethod='browser';row.provenanceVersion=VERSION;row.browserObservedAt=now;delete row.error;delete row.accessIssue;delete row.inspectionNote;}
  }
  add(page,true);for(const link of snapshot.links)add(link);
  const counts={ok:0,redirect:0,error:0,skipped:0,discovered:0,loading:0};for(const row of report.pages)counts[row.status]++;
  report.summary={discovered:report.pages.length,inspected:counts.ok+counts.redirect+counts.error,ok:counts.ok,redirect:counts.redirect,
    failed:counts.error,skipped:counts.skipped,pending:counts.discovered+counts.loading,verification:report.pages.filter(p=>p.accessIssue).length};
  report.status=limited?'limited':report.summary.pending||report.summary.failed||report.discovery?.partial?'partial':'completed';
  const sessionStartedAt=options.browserSessionStartedAt||now;
  const baseDurationMs=previous?.browserCapture?.sessionStartedAt===sessionStartedAt?previous.browserCapture.baseDurationMs||0:previous?.durationMs||0;
  report.durationMs=baseDurationMs+Math.max(0,Date.now()-Date.parse(sessionStartedAt));
  report.finishedAt=now;report.revision++;report.dataRevision=(report.dataRevision||0)+1;
  report.browserCapture={pages:report.pages.filter(p=>p.inspectionMethod==='browser').length,lastPage:page,capturedAt:now,sessionStartedAt,baseDurationMs,
    links:snapshot.links.length,truncated:snapshot.truncated===true};
  if(snapshot.truncated&&!report.warnings.some(w=>w.error==='mapBrowserLinksLimited'))report.warnings.push({error:'mapBrowserLinksLimited'});
  return report;
}

export function createBrowserMapBridge({prepare,onCapture,isBusy,isCurrent,now=Date.now}){
  let target;
  return {
    async prepare(input){
      if(isBusy())throw fail('mapAuditBusy',409);
      const setup=await prepare(input);target={...setup,code:randomBytes(18).toString('base64url'),expires:now()+30*60*1000};
      return {code:target.code,expiresAt:new Date(target.expires).toISOString()};
    },
    async handle(req,res,url,json){
      if(url.pathname!=='/api/manual/map-links')return false;
      const origin=req.headers.origin;
      if(!/^chrome-extension:\/\/[a-p]{32}$/.test(origin||'')){json(403,{error:'mapBrowserPairing'});return true;}
      res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
      if(req.method==='OPTIONS'){
        res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','content-type, x-atlas-pairing');
        if(req.headers['access-control-request-private-network']==='true')res.setHeader('Access-Control-Allow-Private-Network','true');
        res.writeHead(204).end();return true;
      }
      const current=target;
      if(req.method!=='POST'||!current||current.expires<now()||req.headers['x-atlas-pairing']!==current.code||!isCurrent(current)){
        json(403,{error:'mapBrowserPairing'});return true;
      }
      if(isBusy()){json(409,{error:'mapAuditBusy'});return true;}
      try{
        let bytes=0;const chunks=[];
        for await(const chunk of req.iterator({destroyOnReturn:false})){bytes+=chunk.length;if(bytes>4*1024*1024)throw fail('mapInvalidBrowserLinks',413);chunks.push(chunk);}
        const snapshot=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(target!==current||current.expires<now()||!isCurrent(current))throw fail('mapBrowserPairing',403);
        if(isBusy())throw fail('mapAuditBusy',409);
        const count=await onCapture(current,snapshot);
        json(200,{ok:true,urls:count});
      }catch(error){req.resume();json(error.status||400,{error:error.status?error.message:'mapInvalidBrowserLinks'});}
      return true;
    }
  };
}
