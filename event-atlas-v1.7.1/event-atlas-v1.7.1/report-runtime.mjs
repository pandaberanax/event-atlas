import {pageIssues} from './dist/model.js';
import {eventPlatform} from './dist/platforms.js';
const runtimes=new WeakMap();
export function createRuntime(report){
 const runtime={eventsByPage:new Map(),pageStats:new Map(),names:new Set(),networkNames:new Set(),totals:{completed:0,successful:0,failed:0,attention:0,testedElements:0,skippedElements:0},durations:[]};
 runtimes.set(report,runtime);
 for(const e of report.events)indexEvent(report,e);
 for(const p of report.pages)updatePage(report,p);
 return runtime;
}
export function indexEvent(report,e){const r=runtimes.get(report);let list=r.eventsByPage.get(e.page);if(!list)r.eventsByPage.set(e.page,list=[]);list.push(e);const name=eventPlatform(e)+'\u0000'+e.name;r.names.add(name);if(e.source==='network')r.networkNames.add(name);}
export function updatePage(report,p){const r=runtimes.get(report),old=r.pageStats.get(p.url)||{};
 const current={completed:p.status!=='loading'?1:0,successful:p.status==='ok'?1:0,failed:p.status==='error'?1:0,attention:pageIssues(p).attention?1:0,testedElements:0,skippedElements:0};
 for(const a of p.actions||[]){if(a.status==='tested')current.testedElements++;else if(['error','skipped'].includes(a.status))current.skippedElements++;}
 for(const key of Object.keys(current))r.totals[key]+=current[key]-(old[key]||0);r.pageStats.set(p.url,current);
 if(p.durationMs&&!old.completed&&p.status!=='loading')r.durations.push(p.durationMs);
}
export function pageEvents(report,url){return runtimes.get(report)?.eventsByPage.get(url)||report.events.filter(e=>e.page===url);}
export function currentSummary(report,discovered,remaining,concurrency){const r=runtimes.get(report),active=report.pages.filter(p=>p.status==='loading');const recent=r.durations.slice(-20);const average=recent.length?recent.reduce((a,b)=>a+b,0)/recent.length:0;
 const pending=Math.min(remaining,Math.max(0,report.options.maxPages-report.pages.length))+active.length;
 return {...r.totals,visited:report.pages.length,discovered,remaining,activeUrls:active.map(p=>p.url),eventNames:r.names.size,networkEventNames:r.networkNames.size,observations:report.events.length,etaMs:report.status==='running'&&average?Math.round(average*pending/concurrency):null};
}
