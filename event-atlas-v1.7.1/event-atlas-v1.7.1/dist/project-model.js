import {eventInfo} from './event-model.js';

// Keep query variants and SPA fragments distinct; normalize only query order.
export function projectUrl(value){try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return '';u.searchParams.sort();return u.href;}catch{return '';}}
export function eventAtUrl(event,url){const info=eventInfo(event);return [event.page,info.origin,info.observed].some(value=>projectUrl(value)===projectUrl(url));}

export function projectInventory(sources){
  const pages=new Map();
  const site=sources[0]?.report.root?new URL(sources[0].report.root):null;
  const ensure=value=>{const url=projectUrl(value);if(!url)return;const target=new URL(url);
    if(site&&(target.hostname.replace(/^www\./,'')!==site.hostname.replace(/^www\./,'')||target.port!==site.port))return;
    let p=pages.get(url);if(!p){p={url,title:'',map:null,audit:null,events:0};pages.set(url,p);}return p;};
  for(const {key,report} of [...sources].sort((a,b)=>String(a.report.startedAt||'').localeCompare(String(b.report.startedAt||'')))){
    const map=report.mode==='website-map',counts=new Map();
    if(!map)for(const event of report.events||[]){
      const info=eventInfo(event);
      for(const url of new Set([event.page,info.origin,info.observed].map(projectUrl).filter(Boolean)))counts.set(url,(counts.get(url)||0)+1);
    }
    for(const row of report.pages||[]){const p=ensure(row.url);if(!p)continue;
      if(row.title)p.title=row.title;
      const source={key,status:row.status,httpStatus:row.httpStatus,finalUrl:row.finalUrl,startedAt:report.startedAt,version:report.appVersion};
      if(map)p.map=source;else {p.audit=source;p.events=counts.get(p.url)||0;}
    }
    if(!map)for(const [url,count]of counts){const p=ensure(url);if(p&&p.audit?.key!==key){p.events=count;p.audit={key,status:'observed',startedAt:report.startedAt,version:report.appVersion};}}
  }
  return [...pages.values()].sort((a,b)=>a.url.localeCompare(b.url));
}

export function projectPageDetails(sources,url){
  url=projectUrl(url);
  const matches=[];
  for(const {key,report} of sources){
    const page=report.pages?.find(p=>projectUrl(p.url)===url);
    const events=(report.events||[]).filter(e=>eventAtUrl(e,url));
    if(!page&&!events.length)continue;
    const {elements,...safePage}=page||{};
    matches.push({key,kind:report.mode==='website-map'?'map':'audit',root:report.root,startedAt:report.startedAt,
      version:report.appVersion,status:report.status,page:page?safePage:null,events});
  }
  return {url,path:new URL(url).pathname,matches:matches.sort((a,b)=>String(b.startedAt||'').localeCompare(String(a.startedAt||''))).slice(0,20)};
}
