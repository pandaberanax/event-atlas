import {eventPlatform} from './platforms.js';
const pageNames=/^(page_view|pageview|gtm_pageview|moe_page_viewed|\$mp_web_page_view)$/i;
const key=url=>{try{const u=new URL(url);u.hash='';u.searchParams.sort();return u.href;}catch{return '';}};
export function eventInfo(e){
 const origin=e.originPage||e.page||'',observed=e.eventPage||e.reportedPage||e.frameUrl||origin;
 const navigated=!!key(observed)&&!!key(origin)&&key(observed)!==key(origin);
 const pageLike=pageNames.test(e.name||'');
 const category=e.eventCategory||(pageLike?'page':e.clickEvidence==='handler'?'interaction':'other');
 const attribution=e.relationship||(e.attribution==='batch-time'?'batch':navigated&&e.action==='click'?'navigation':pageLike?'page':e.clickEvidence==='handler'?'click-handler':e.action==='click'?'after-click':'page');
 return {origin,observed,navigated,category,attribution,legacy:!e.relationship,contextElement:e.testElement||e.element||null};
}
export function classifyEvent(data,phase,origin){
 const info=eventInfo({...data,page:origin,originPage:origin,action:phase.type});
 const handler=phase.type==='click'&&data.interaction?.selector===phase.element?.selector&&!info.navigated;
 const category=pageNames.test(data.name||'')?'page':handler?'interaction':'other';
 const relationship=data.batch?'batch':info.navigated&&phase.type==='click'?'navigation':category==='page'?'page':handler?'click-handler':phase.type==='click'?'after-click':phase.type==='impression'?'viewport':'page';
 return {originPage:origin,eventPage:info.observed,eventCategory:category,relationship,clickEvidence:handler?'handler':'temporal'};
}
export function groupEvents(events){
 const groups=new Map();
 for(const e of events){const info=eventInfo(e),k=JSON.stringify([eventPlatform(e),e.name,info.category]);let g=groups.get(k);if(!g){g={key:k,name:e.name,platform:eventPlatform(e),category:info.category,events:[],pages:new Set(),elements:new Set(),sources:new Set()};groups.set(k,g);}g.events.push(e);g.pages.add(info.observed);if(info.contextElement)g.elements.add(info.origin+'\u0000'+info.contextElement.selector);g.sources.add(e.source);}
 return [...groups.values()];
}
export function skippedBreakdown(pages){
 const totals={hidden:0,limited:0,sensitive:0,disabled:0,failed:0,other:0};
 for(const p of pages)for(const a of p.actions||[]){if(a.status==='error'){totals.failed++;continue;}if(a.status!=='skipped')continue;const r=a.reason||'';totals[r==='Tidak terlihat'?'hidden':r==='Batas elemen per halaman'?'limited':r==='Elemen nonaktif'?'disabled':/Form\/submit|Aksi sensitif|Link di luar|Unduhan|Protokol/.test(r)?'sensitive':'other']++;}
 return totals;
}
export const completePage=p=>p.status==='skipped'||p.status==='ok'&&(!p.elementCount||p.actions?.length>=p.elementCount);
export function resumeRemaining(report){
 if(report?.mode==='manual'||!Array.isArray(report?.discovery?.urls))return 0;
 const complete=new Set((report.pages||[]).filter(completePage).map(p=>p.url));
 return new Set([...report.discovery.urls,...(report.pages||[]).map(p=>p.url),report.root].filter(url=>url&&!complete.has(url))).size;
}
