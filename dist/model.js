export function elapsedMs(report, now=Date.now()) {
  if(!report?.startedAt)return 0;
  const start=Date.parse(report.sessionStartedAt||report.startedAt);
  const end=report.finishedAt?Date.parse(report.finishedAt):now;
  if(!Number.isFinite(start)||!Number.isFinite(end))return 0;
  return Math.max(0,end-start)+(Number(report.previousDurationMs)||0);
}
export function formatDuration(ms) {
  const seconds=Math.max(0,Math.floor(ms/1000));
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
}
export function pageIssues(p) {
  const runtime=p.runtimeErrors || (p.status==='ok'||p.status==='loading'?p.errors || []:[]);
  const failedActions=(p.actions || []).filter(a=>a.status==='error');
  const skippedActions=(p.actions || []).filter(a=>a.status==='skipped');
  const failedProbes=(p.probes || []).filter(probe=>probe.status==='error');
  const unparsed=p.unparsedRequests||[];
  const routeErrors=p.routeErrors||[];
  return {attention:['error','skipped','interrupted'].includes(p.status)||runtime.length>0||failedActions.length>0||failedProbes.length>0||unparsed.length>0||routeErrors.length>0,failed:p.status==='error',skipped:p.status==='skipped',runtime,failedActions,skippedActions,failedProbes,unparsed,routeErrors};
}
export function mergeReport(previous, incoming, patch) {
  if(!patch||previous?.id!==incoming.id)return incoming;
  if(Array.isArray(patch.pageIndexes)) {
    const pages=[...previous.pages];
    patch.pageIndexes.forEach((index,i)=>{pages[index]=incoming.pages[i];});
    const changed=new Set(patch.eventPages);
    const events=previous.events.filter(e=>!changed.has(e.page)).concat(incoming.events).sort((a,b)=>Number(a.id.slice(3))-Number(b.id.slice(3)));
    return {...incoming,pages,events};
  }
  return {...incoming,pages:previous.pages.slice(0,patch.pageFrom).concat(incoming.pages),events:previous.events.slice(0,patch.eventFrom).concat(incoming.events)};
}
