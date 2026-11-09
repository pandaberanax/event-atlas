import {VERSION,CHANGELOG,SPEED_PROFILES} from './release.js';
import {t,getLanguage,setLanguage,locale,applyLanguage,translateEvidence} from './i18n.js';
import {elapsedMs,formatDuration,pageIssues,mergeReport} from './model.js';
import {PLATFORMS,PLATFORM_IDS,platformName,eventPlatform,uniqueEvents} from './platforms.js';
import {eventInfo,skippedBreakdown,resumeRemaining} from './event-model.js';
import {filteredEvents,renderExplorer,relationshipName} from './explorer.js';
import {createTimeline} from './timeline.js';
import {createWebsiteMapView} from './website-map.js';
import {TRIGGERS,DEFAULT_TRIGGERS,probeOutcome} from './triggers.js';
const $=id=>document.getElementById(id);
const timeline=createTimeline();
const websiteMap=createWebsiteMapView({auditUrl:url=>{$('domain').value=url;$('scope').value='single';options();tab('events');$('domain').focus();}});
const state={report:null,local:false,active:false,connected:true,token:'',engineVersion:'',source:'all',siteMaxPages:'100',resultPlatform:'all',search:'',page:0,pageFilter:'all',pageSearch:'',pageTable:0,tab:'events',detail:null,notice:null,eventView:'groups',category:'all',groupFilter:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v||0).toLocaleString(locale());
const sourceName=s=>s==='network'?t('network'):s==='gtag'?'gtag()':s==='sdk'?t('sdkCall'):'dataLayer';
const reason=v=>translateEvidence(v);
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3500);}
function notice(key,params={}){state.notice=key?{key,params}:null;renderNotice();}
function renderNotice(){const n=state.notice;$('notice').textContent=n?reason(t(n.key,n.params)):'';$('notice').hidden=!n;}
function tab(name){state.tab=name;document.querySelector('main').dataset.view=name;document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));for(const v of ['events','pages','timeline','map','guide','changes'])$(v+'View').hidden=v!==name;timeline.show(name==='timeline');websiteMap.show(name==='map');}
function safeUrl(v){try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:'#';}catch{return '#';}}
function pathLabel(v){try{const u=new URL(v);return u.pathname+u.search;}catch{return v;}}
const filtered=()=>filteredEvents(state);
const selected=()=>[...document.querySelectorAll('[data-platform]:checked')].map(el=>el.dataset.platform);
const selectedTriggers=()=>[...document.querySelectorAll('[data-trigger]:checked')].map(el=>el.dataset.trigger);
const reportPlatforms=r=>r?.options?.platforms||['ga4','dataLayer'];
const filterKey={all:'allPages',attention:'attentionPages',failed:'failedPages',runtime:'runtimePages',actions:'actionPages',skipped:'skippedPages'};
function filteredPages(){return(state.report?.pages||[]).map((p,index)=>({p,index,issues:cachedIssues(p)})).filter(({p,issues:i})=>{
 const matches=state.pageFilter==='all'||state.pageFilter==='attention'&&i.attention||state.pageFilter==='failed'&&i.failed||state.pageFilter==='runtime'&&i.runtime.length||state.pageFilter==='actions'&&(i.failedActions.length||i.failedProbes.length)||state.pageFilter==='skipped'&&i.skippedActions.length;
 return matches&&[p.url,p.title,...(p.errors||[])].join(' ').toLowerCase().includes(state.pageSearch.toLowerCase());
});}
function reviewReasons(p){const i=cachedIssues(p),out=[];if(p.status==='interrupted')out.push(t('interrupted'));if(i.failed)out.push(t('navigationError')+(p.navigationError?' · '+p.navigationError:''));if(i.skipped)out.push(reason(p.errors?.[0]||t('robotsSkipped')));if(i.runtime.length)out.push(t('jsError')+' · '+fmt(i.runtime.length));if(i.failedActions.length)out.push(t('clickError')+' · '+fmt(i.failedActions.length));if(i.failedProbes.length)out.push(t('probeFailed')+' · '+fmt(i.failedProbes.length));if(i.routeErrors.length)out.push(t('networkRouteError')+' · '+fmt(i.routeErrors.length));if(i.unparsed.length)out.push(t('unparsedTitle')+' · '+fmt(i.unparsed.length));return out;}
function currentDuration(){const r=state.report;if(!r)return 0;if(r.mode==='manual'&&Number.isFinite(r.durationMs))return r.durationMs;return r.finishedAt||state.active?elapsedMs(r):r.durationMs??elapsedMs({...r,finishedAt:r.events?.at(-1)?.time||r.startedAt});}
function renderTimer(){$('auditTimer').textContent=formatDuration(currentDuration());$('timerLabel').textContent=t(state.report?.finishedAt?'totalDuration':'elapsed');}
function renderConnection(){
 $('connection').innerHTML=`<span class="dot ${state.local&&state.connected?'':'muted'}"></span><span>${esc(state.local?t('localConnection',{version:state.engineVersion||'1.0.0'}):t('cloudConnection'))}</span>`;
 const old=state.local&&state.engineVersion!==VERSION;
 $('engineNotice').textContent=old?t('engineOld',{version:state.engineVersion||'1.0.0',app:VERSION}):'';$('engineNotice').hidden=!old;
 $('runnerDownload').hidden=state.local;
}
function renderPages(){
 const all=state.report?.pages||[],items=filteredPages();
 $('pagesCsvAll').disabled=!all.length;
 $('pagesCsvFiltered').disabled=!items.length;
 const totalPages=Math.max(1,Math.ceil(items.length/30));state.pageTable=Math.min(state.pageTable,totalPages-1);
 const keys=['failed','runtime','actions','skipped'];const counts=[all.filter(p=>cachedIssues(p).failed).length,all.filter(p=>cachedIssues(p).runtime.length).length,all.filter(p=>(cachedIssues(p).failedActions.length||cachedIssues(p).failedProbes.length)).length,all.filter(p=>cachedIssues(p).skipped).length];
 $('reviewSummary').innerHTML=keys.map((key,i)=>`<button data-review-filter="${key==='skipped'?'attention':key}">${esc(t(['failedCount','runtimeCount','actionCount','skippedCount'][i],{n:fmt(counts[i])}))}</button>`).join('');
 $('pagesBody').innerHTML=items.slice(state.pageTable*30,state.pageTable*30+30).map(({p,index,issues:i})=>`<tr><td><a href="${esc(safeUrl(p.url))}" target="_blank" rel="noreferrer" class="page-url">${esc(pathLabel(p.url))}</a><span class="table-sub" title="${esc(p.title)}">${esc(p.title)}</span></td><td><span class="source ${i.attention?'gtag':''}">${esc(t(p.status))}</span><span class="table-sub">HTTP ${esc(p.httpStatus||'—')}</span></td><td><span class="event-id">${esc(p.tags?.join(', ')||t('notFound'))}</span></td><td>${esc(t('tested',{n:fmt(p.actions?.filter(a=>a.status==='tested').length)}))}<span class="table-sub">${esc(t('skippedActions',{n:fmt(i.failedActions.length+i.skippedActions.length)}))}</span><button class="text-button page-detail" data-page="${index}">${esc(t('viewDetails'))} ↗</button></td><td>${reviewReasons(p).map(s=>`<span class="review-reason">${esc(s)}</span>`).join('')||'<span class="table-sub">—</span>'}</td></tr>`).join('');
 $('pagesEmpty').hidden=items.length>0;$('pageTableCount').textContent=t('filteredPages',{shown:fmt(items.length),total:fmt(all.length),filter:t(filterKey[state.pageFilter])});$('pageTableNumber').textContent=`${state.pageTable+1} / ${totalPages}`;$('pagePrev').disabled=state.pageTable===0;$('pageNext').disabled=state.pageTable>=totalPages-1;
}
function render(){
 const r=state.report,s=r?.summary||{},manual=r?.mode==='manual',attention=s.attention??(r?.pages||[]).filter(p=>cachedIssues(p).attention).length;
 for(const [id,value] of [['statPages',s.visited],['statEvents',s.eventNames??uniqueEvents(r?.events||[])],['statElements',s.testedElements],['statIssues',attention]])$(id).textContent=r?fmt(value):'—';
 $('statPagesLabel').textContent=t(manual?'manualPages':'statPages');$('statElementsLabel').textContent=t(manual?'manualClicks':'statElements');$('evidenceNote').textContent=t(manual?'manualEvidence':'evidenceNote');
 $('pagesHint').textContent=t(manual?'manualPagesHint':r?'discoveredHint':'discoveredDefault',{n:fmt(s.discovered)});$('issuesHint').textContent=r?t('issuesSub',{n:fmt(s.skippedElements)}):'';
 $('reportName').textContent=r?(r.options?.scope==='single'?r.root:new URL(r.root||'https://example.com').hostname):t('noReport');$('reportName').title=r?.root||'';$('reportDate').textContent=r?.startedAt?'· '+new Date(r.startedAt).toLocaleString(locale(),{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
 const reportStatus=r?.status==='completed'&&s.failed?(s.successful?'completedWithErrors':'error'):r?.status;
 $('reportStatus').textContent=t(manual&&reportStatus==='completed'?'timeline_completed':reportStatus||'waiting');$('reportVersion').textContent=r?t(manual?'manualReportVersion':'reportVersion',{version:r.appVersion||'1.0.0'}):'';$('reportDot').style.background=reportStatus==='completed'?'#71a85e':r?'#c2a566':'#a8b5ad';
 renderExplorer(state,sourceName);
 renderPages();$('coverage').textContent=manual?t('manualCoverage',{pages:fmt(s.visited),clicks:fmt(s.testedElements)}):r?t('coverage',{visited:fmt(s.visited),discovered:fmt(s.discovered),remaining:fmt(s.remaining),skipped:fmt(s.skippedElements),pages:fmt(r.options?.maxPages),elements:fmt(r.options?.maxElements),consent:t(r.options?.consent==='accept'?'consentAccept':'consentUnchanged')})+' '+t('selectedPlatformReport',{platforms:reportPlatforms(r).map(platformName).join(', ')})+' '+t('scopeSummary',{scope:t(r.options?.scope==='single'?'scopeSingle':'scopeSite')}):'';
 if(r?.options?.triggers) $('coverage').textContent+=' '+t('selectedTriggers',{triggers:r.options.triggers.map(trigger=>t(trigger)).join(', ')});
 $('limitations').innerHTML=(manual?[t('manualLimits')]:r?.limitations||[t('noLimits')]).map(v=>`<li>${esc(reason(v))}</li>`).join('');
 $('progress').hidden=!state.active;$('startBtn').hidden=state.active;$('stopBtn').hidden=!state.active;
 for(const id of ['domain','maxPages','maxElements','consent','speed','scope','resetPolicy','assetCache'])$(id).disabled=state.active;
 document.querySelectorAll('[data-platform],[data-trigger]').forEach(el=>el.disabled=state.active);
 $('maxElements').disabled=state.active||!selectedTriggers().some(v=>['click','outbound','form_submit'].includes(v));$('maxPages').disabled=state.active||$('scope').value==='single';$('scopeHelp').textContent=t($('scope').value==='single'?'scopeSingleHelp':'scopeSiteHelp');document.querySelector('.audit-title p').textContent=t($('scope').value==='single'?'scopeSingleBody':'scopeBody');$('domain').placeholder=$('scope').value==='single'?'example.com/products/detail':'example.com';for(const option of $('speed').options)option.textContent=t(option.value+($('scope').value==='single'?'Single':''));
 if(state.active){const urls=s.activeUrls||r?.pages?.filter(p=>p.status==='loading').map(p=>p.url)||[];$('progressText').textContent=urls.join(' · ')||t('preparing');$('progressCount').textContent=t('progressCount',{done:fmt(s.completed??r?.pages?.filter(p=>p.status!=='loading').length),active:fmt(urls.length),n:fmt(s.discovered)});$('progressBar').style.width=Math.min(100,(s.completed??0)/Math.max(1,Math.min(s.discovered||1,r?.options?.maxPages||1))*100)+'%';}
 $('jsonExport').disabled=!r;$('csvExport').disabled=!r;$('speedHelp').textContent=$('scope').value==='single'?t('singleSpeedHelp',{seconds:((SPEED_PROFILES[$('speed').value]?.waitMs||1800)/1000).toLocaleString(locale())}):t({balanced:'speedBalanced',fast:'speedFast',express:'speedExpress',thorough:'speedThorough'}[$('speed').value]);renderNotice();renderConnection();renderTimer();renderRunDetails();
}
const field=(label,value)=>`<div class="detail-field"><label>${esc(t(label))}</label><div>${value}</div></div>`;
function renderNavigationAttempts(page) {
 const attempts = page.navigationAttempts || [];
 if (!attempts.length) return '';
 const rows = attempts.map(attempt=>{
   const protocol = attempt.protocol==='http1' ? 'HTTP/1.1' : t('defaultProtocol');
   const result = attempt.error || (attempt.httpStatus ? 'HTTP '+attempt.httpStatus : t(attempt.status));
   return '<li>'+esc(protocol+' · '+result)+'</li>';
 }).join('');
 return field('navigationAttempts','<ol>'+rows+'</ol>');
}
function renderProbes(page) {
 const counts = new Map();
 for (const event of state.report.events) {
   if (event.page === page.url) counts.set(event.actionId, (counts.get(event.actionId) || 0) + 1);
 }
 const outcomes = ['all','probeObserved','probeNoEvent','probeSkipped','probeManual','probeFailed','probePending'];
 const selectedOutcome = state.detail.outcome;
 const options = outcomes.map(key => '<option value="'+key+'"'+(key===selectedOutcome?' selected':'')+'>'+esc(t(key==='all'?'probeAll':key))+'</option>').join('');
 const rows = [...(page.probes||[]), ...(page.actions||[])].map(probe => {
   const count = counts.get(probe.id) || 0;
   const outcome = probeOutcome(probe,count);
   if (selectedOutcome!=='all' && selectedOutcome!==outcome) return '';
   const element = probe.element;
   const name = element?.text || element?.href || element?.selector || t(probe.trigger || 'click');
   const formNote = probe.trigger==='form_submit' && probe.status==='tested'
     ? '<p>'+esc(t(probe.submitObserved?'submitHeld':'submitNotObserved'))+'</p>' : '';
   const navigations = (probe.blockedNavigations||[]).map(n => '<p class="navigation-held">'+esc(t('navigationHeld'))+' · '+esc(n.url)+'</p>').join('');
   const label = t(outcome)+(count?' · '+t('rawCount',{n:fmt(count)}):'');
   return '<div class="detail-field"><label>'+esc(t(probe.trigger||'click'))+'</label><div><strong>'+esc(name)+'</strong><p>'+esc(label)+'</p>'+
     (probe.reason?'<p>'+esc(reason(probe.reason))+'</p>':'')+formNote+(element?.selector?'<pre>'+esc(element.selector)+'</pre>':'')+navigations+'</div></div>';
 }).join('');
 return '<label class="page-filter">'+esc(t('triggerOutcomes'))+' <select id="probeFilter">'+options+'</select></label>'+
   (rows || '<p class="detail-metadata">'+esc(t('noProbes'))+'</p>');
}
function renderDetail(){
 if(!state.detail)return;
 if(state.detail.type==='event'){
  const e=state.report?.events.find(e=>e.id===state.detail.id);if(!e)return;const info=eventInfo(e),manual=state.report.mode==='manual';$('detailType').textContent=t('observation');$('detailName').textContent=e.name;
  $('detailBody').innerHTML=field('platform',esc(platformName(eventPlatform(e))))+field('evidence',`<span class="source ${esc(e.source)}">${esc(sourceName(e.source))}</span> × ${fmt(e.count)}`)+field('pageLabel',`<a href="${esc(safeUrl(e.page))}" target="_blank" rel="noreferrer">${esc(e.page)}</a>`)+field('originPage',esc(info.origin))+field('eventPage',esc(info.observed))+field('category',esc(t('category_'+info.category)))+field('relationship',esc(relationshipName(e)))+field('provenance',esc(e.provenanceVersion||state.report.appVersion||'1.0.0'))+(manual?field('manualTitle',esc(t('manualObservation'))):field('isolation',esc(t(e.isolation==='reused-page'?'reuseEvidence':e.isolation==='isolated'?'isolatedMode':'legacyEvidence'))))+(manual&&e.httpStatus?field('httpStatus',esc(e.httpStatus)):'')+field('testAction',esc(t(e.trigger||e.action)))+field('testElement',esc(e.element?.text||t('page'))+(e.element?`<span class="table-sub">${esc(e.element.region)} · ${esc(e.element.tag)}</span>`:''))+(e.element?field('selector',`<pre>${esc(e.element.selector)}</pre><button class="text-button" id="copySelector">${esc(t('copySelector'))}</button>`):'')+(eventPlatform(e)==='ga4'?field('measurement',esc(e.measurementId||t('unknownMeasurement'))):'')+(e.apiMethod?field('sdkMethod',esc(e.apiMethod)):'')+field('parameters',`<pre>${esc(JSON.stringify(e.parameters||{},null,2))}</pre>`)+(e.endpoint?field('endpoint',esc(e.endpoint)):'')+(e.reportedPage?field('payloadPage',esc(e.reportedPage)):'')+(e.frameUrl!==e.page?field('frame',esc(e.frameUrl)):'')+`<div class="detail-warning">${esc(t(manual?(e.source==='network'?'manualNetwork':'manualQueue'):e.source==='network'?'heldWarning':'callWarning')+(e.action==='impression'?t('impressionContext'):e.element?t('attributionWarning'):'')+(e.attribution==='batch-time'?t('batchWarning'):''))}</div>`;
  if($('copySelector'))$('copySelector').onclick=async()=>{try{await navigator.clipboard.writeText(e.element.selector);toast(t('copied'));}catch{toast(t('copyFallback'));}};
 }else{
  const p=state.report?.pages[state.detail.index];if(!p)return;const i=cachedIssues(p);$('detailType').textContent=t('navPages');$('detailName').textContent=t('detailsPage');
  const failures=[...(i.failed?(p.navigationError?[p.navigationError]:p.errors||[]):[]),...i.runtime,...i.routeErrors,...i.failedActions.map(a=>(a.element?.text||a.element?.selector||t('noLabel'))+' · '+reason(a.reason)),...(i.skipped?(p.errors||[]):[]),...i.unparsed.map(v=>platformName(v.platform)+' · '+v.endpoint+' · '+reason(v.reason))];
  const details=failures.length?`<ul>${[...new Set(failures)].map(v=>`<li>${esc(reason(v))}</li>`).join('')}</ul>`:esc(t('noPageIssues'));
  $('detailBody').innerHTML=`<p>${esc(p.url)}</p><p class="detail-metadata">${esc(t(p.status))} · HTTP ${esc(p.httpStatus||'—')} · ${esc(t('consent'))}: ${esc(p.consent==='accepted'?t('consentAccept'):t('consentUnchanged'))}</p><div class="detail-issues"><strong>${esc(t('reviewReason'))}</strong>${details}</div><div class="detail-warning">${esc(t('testedWarning'))}</div>`+renderNavigationAttempts(p)+renderProbes(p);
  $('probeFilter').onchange=e=>{state.detail.outcome=e.target.value;renderDetail();$('probeFilter').focus();};
 }
}
function openDetail(detail){state.detail={...detail,outcome:'all'};renderDetail();if(!$('detail').open)$('detail').showModal();}
function options(){const pageValue=$('maxPages').value||'100',elementValue=$('maxElements').value||'12';const pages=[...new Set([25,100,500,3000,10000,Number(pageValue)])].sort((a,b)=>a-b);const elements=[...new Set([6,10,12,20,50,200,Number(elementValue)])].sort((a,b)=>a-b);$('maxPages').innerHTML=pages.map(n=>`<option value="${n}">${esc(t(n===10000?'upToPages':'pageOption',{n:fmt(n)}))}</option>`).join('');$('maxPages').value=pageValue;$('maxElements').innerHTML=elements.map(n=>`<option value="${n}">${esc(n===0?t('noClicks'):t(n===200?'upToElements':'elementOption',{n:fmt(n)}))}</option>`).join('');$('maxElements').value=elementValue;}
function syncForm(r){$('scope').value=r.options.scope||'site';if($('scope').value==='site')state.siteMaxPages=String(r.options.maxPages);$('domain').value=r.root;for(const key of ['maxPages','maxElements']){const value=String(r.options[key]);if(![...$(key).options].some(o=>o.value===value))$(key).add(new Option(value,value));$(key).value=value;}$('resetPolicy').value=r.options.resetPolicy||'isolated';$('assetCache').checked=r.options.assetCache!==false;$('consent').value=r.options.consent||'unchanged';$('speed').value=r.options.speed||'balanced';document.querySelectorAll('[data-platform]').forEach(el=>el.checked=reportPlatforms(r).includes(el.dataset.platform));document.querySelectorAll('[data-trigger]').forEach(el=>el.checked=(r.options.triggers||DEFAULT_TRIGGERS).includes(el.dataset.trigger));options();}
function languageChanged(){applyLanguage();timeline.render();websiteMap.render();$('resultPlatform').innerHTML='<option value="all">'+esc(t('allPlatforms'))+'</option>'+PLATFORMS.map(p=>'<option value="'+p.id+'">'+p.name+'</option>').join('');$('resultPlatform').value=state.resultPlatform;$('language').value=getLanguage();document.querySelectorAll('.app-version').forEach(el=>el.textContent='v'+VERSION);$('runnerDownload').textContent='↓ '+t('download',{version:VERSION});options();$('changelog').innerHTML=CHANGELOG.map(r=>`<article class="release"><h3>v${esc(r.version)}<time>${esc(new Date(r.date+'T12:00:00Z').toLocaleDateString(locale(),{day:'numeric',month:'long',year:'numeric'}))}</time></h3><ul>${r.changes[getLanguage()].map(c=>`<li>${esc(c)}</li>`).join('')}</ul></article>`).join('');render();if($('detail').open)renderDetail();}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));$('versionLink').onclick=()=>tab('changes');$('guideBtn').onclick=()=>tab('guide');$('language').onchange=e=>{setLanguage(e.target.value);languageChanged();};$('speed').onchange=render;$('scope').onchange=()=>{if($('scope').value==='single'){state.siteMaxPages=$('maxPages').value||'100';if(![...$('maxPages').options].some(o=>o.value==='1'))$('maxPages').add(new Option(t('pageOption',{n:1}),'1'));$('maxPages').value='1';}else $('maxPages').value=state.siteMaxPages;render();};
$('issuesCard').onclick=()=>{state.pageFilter='attention';state.pageTable=0;state.pageSearch='';$('pageSearch').value='';$('pageFilter').value='attention';tab('pages');renderPages();$('pagesView').scrollIntoView({behavior:'smooth',block:'start'});};
$('pageFilter').onchange=e=>{state.pageFilter=e.target.value;state.pageTable=0;renderPages();};$('pageSearch').oninput=e=>{state.pageSearch=e.target.value;state.pageTable=0;renderPages();};$('reviewSummary').onclick=e=>{const b=e.target.closest('[data-review-filter]');if(!b)return;state.pageFilter=b.dataset.reviewFilter;$('pageFilter').value=state.pageFilter;state.pageTable=0;renderPages();};
$('pagePrev').onclick=()=>{state.pageTable--;renderPages();};$('pageNext').onclick=()=>{state.pageTable++;renderPages();};
$('eventsBody').onclick=e=>{const group=e.target.closest('[data-group]');if(group){state.groupFilter=decodeURIComponent(group.dataset.group);state.eventView='observations';$('eventView').value=state.eventView;state.page=0;render();return;}const row=e.target.closest('[data-event]');if(row)openDetail({type:'event',id:row.dataset.event});};$('eventsBody').onkeydown=e=>{if(e.key==='Enter')e.target.closest('[data-event],[data-group]')?.click();};$('pagesBody').onclick=e=>{const b=e.target.closest('[data-page]');if(b)openDetail({type:'page',index:Number(b.dataset.page)});};$('closeDetail').onclick=()=>$('detail').close();$('detail').onclose=()=>{state.detail=null;};
document.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{state.source=b.dataset.source;state.page=0;document.querySelectorAll('[data-source]').forEach(x=>x.classList.toggle('selected',x===b));render();});$('search').oninput=e=>{state.search=e.target.value;state.page=0;render();};$('prev').onclick=()=>{state.page--;render();};$('next').onclick=()=>{state.page++;render();};
function download(data,type,name){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('jsonExport').onclick=()=>{if(state.report)download(JSON.stringify({...state.report,durationMs:currentDuration()},null,2),'application/json','audit.json');};
const csvQuote=v=>{let s=typeof v==='object'?JSON.stringify(v):String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return'"'+s.replace(/"/g,'""')+'"';};
function downloadPages(pages, name) {
 const rows = [['url','final_url','title','status','http_status','elements_tested','elements_skipped','elements_failed','needs_review','review_reasons']];
 for (const page of pages) {
   const issues = cachedIssues(page);
   rows.push([page.url,page.finalUrl,page.title,page.status,page.httpStatus,
     (page.actions||[]).filter(action=>action.status==='tested').length,
     issues.skippedActions.length,issues.failedActions.length,issues.attention,
     reviewReasons(page).join(' | ')]);
 }
 download('\uFEFF'+rows.map(row=>row.map(csvQuote).join(',')).join('\r\n'),'text/csv;charset=utf-8',name);
}
$('pagesCsvAll').onclick=()=>downloadPages(state.report?.pages||[],'pages-coverage.csv');
$('pagesCsvFiltered').onclick=()=>downloadPages(filteredPages().map(item=>item.p),'pages-coverage-filtered.csv');
$('csvExport').onclick=()=>{if(!state.report)return;const rows=[['event_name','platform','source','page_url','test_action','element_text','selector','region','measurement_id','sdk_method','parameters','count','attribution','origin_page','event_page','event_category','relationship','isolation','engine_version','trigger'],...filtered().map(e=>[e.name,eventPlatform(e),e.source,e.page,e.action,e.element?.text||'',e.element?.selector||'',e.element?.region||'',e.measurementId,e.apiMethod||'',e.parameters,e.count,e.attribution,eventInfo(e).origin,eventInfo(e).observed,eventInfo(e).category,eventInfo(e).attribution,e.isolation||'legacy',e.provenanceVersion||state.report.appVersion,e.trigger||e.action])];download('\uFEFF'+rows.map(r=>r.map(csvQuote).join(',')).join('\r\n'),'text/csv;charset=utf-8','events.csv');};
function validateReport(r){if(r?.schemaVersion!==1||!Array.isArray(r.events)||!Array.isArray(r.pages)||!r.summary||!r.options||safeUrl(r.root)==='#')throw Error(t('invalidReport'));for(const e of r.events)if(typeof e.name!=='string'||typeof e.id!=='string'||safeUrl(e.page)==='#'||!['network','gtag','dataLayer','sdk'].includes(e.source)||!PLATFORM_IDS.includes(eventPlatform(e))||(e.source==='sdk'&&!e.platform))throw Error(t('invalidEvent'));return r;}
$('importBtn').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>250*1024*1024)throw Error(t('fileTooLarge'));if(state.active){toast(t('updateBody'));return;}const imported=JSON.parse(await f.text());if(imported?.mode==='website-map'){websiteMap.load(imported);tab('map');return;}if(imported?.mode==='android'){timeline.loadAndroid(imported);notice('imported',{name:f.name});render();tab('timeline');return;}state.report=validateReport(imported);timeline.load(state.report);if(state.report.mode!=='manual')syncForm(state.report);state.groupFilter=null;state.page=0;state.pageTable=0;notice('imported',{name:f.name});render();tab('events');}catch(err){toast(err.message);}finally{e.target.value='';}};
async function localStatus(){
 if(!['localhost','127.0.0.1'].includes(location.hostname))return false;
 try{const query=state.report?'?'+new URLSearchParams({reportId:state.report.id,pages:state.report.pages.length,events:state.report.events.length,revision:state.report.revision||0}):'';const res=await fetch('/api/status'+query,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!res.ok)return false;const data=await res.json();if(!data.local)return false;state.local=true;state.connected=true;state.engineVersion=data.version||'1.0.0';state.token=data.token;timeline.connect(state.token);websiteMap.connect(state.token);state.active=data.active;if(data.report&&state.report?.mode!=='manual'){const changed=state.report?.id!==data.report.id;state.report=mergeReport(state.report,data.report,data.patch);if(changed&&state.report.options)syncForm(state.report);}return true;}catch{state.connected=false;return false;}
}
async function poll(){const was=state.active,ok=await localStatus();if(!ok)notice('disconnected');else if(was&&!state.active){if(state.report?.error)notice(state.report.error);else notice(state.report?.status==='limited'?'limitEnded':'auditEnded');}render();if(state.active)setTimeout(poll,2000);}
$('auditForm').onsubmit=async e=>{e.preventDefault();if(!selected().length){notice('needPlatform');return;}if(!selectedTriggers().length){notice('needTrigger');return;}if(!state.local){notice('localNeeded');tab('guide');return;}try{let url=$('domain').value.trim();if(!/^https?:\/\//i.test(url))url='https://'+url;if(safeUrl(url)==='#')throw Error(t('invalidUrl'));const res=await fetch('/api/audit',{method:'POST',headers:{'Content-Type':'application/json','X-Atlas-Token':state.token},body:JSON.stringify({url,scope:$('scope').value,platforms:selected(),triggers:selectedTriggers(),maxPages:Number($('maxPages').value),maxElements:Number($('maxElements').value),consent:$('consent').value,speed:$('speed').value,resetPolicy:$('resetPolicy').value,assetCache:$('assetCache').checked})});const data=await res.json();if(!res.ok)throw Error(data.error);state.active=true;state.report=null;state.groupFilter=null;state.page=0;state.pageTable=0;notice('started');tab('events');render();setTimeout(poll,500);}catch(err){notice(err.message);}};
$('stopBtn').onclick=async()=>{try{const res=await fetch('/api/stop',{method:'POST',headers:{'X-Atlas-Token':state.token}});if(!res.ok)throw Error();toast(t('stopping'));}catch{toast(t('disconnected'));}};
$('platformChoices').innerHTML=PLATFORMS.map(p=>'<label><input type="checkbox" data-platform="'+p.id+'" checked><span>'+p.name+'</span></label>').join('');
$('triggerChoices').innerHTML=TRIGGERS.map(trigger=>'<label><input type="checkbox" data-trigger="'+trigger+'" '+(DEFAULT_TRIGGERS.includes(trigger)?'checked':'')+'><span data-i18n="'+trigger+'"></span></label>').join('');
$('triggerChoices').onchange=render;
$('resultPlatform').onchange=e=>{state.resultPlatform=e.target.value;state.page=0;render();};

const issueCache=new WeakMap();
function cachedIssues(p){const old=issueCache.get(p);if(old&&old.revision===p.revision)return old.issues;const issues=pageIssues(p);issueCache.set(p,{revision:p.revision,issues});return issues;}
function renderRunDetails(){
 const r=state.report,perf=r?.performance;
 $('runDetails').hidden=!r||r.mode==='manual';
 $('eta').textContent=state.active?t(r?.summary?.etaMs?'eta':'etaPending',{time:formatDuration(r?.summary?.etaMs||0)}):'';
 const checkpoint=r?.checkpoint;$('checkpointStatus').textContent=checkpoint?.error?t('checkpointError',{error:checkpoint.error}):checkpoint?.savedAt?t('checkpointSaved',{time:new Date(checkpoint.savedAt).toLocaleTimeString(locale())}):state.active?t('checkpointPending'):'';
 const skipped=skippedBreakdown(r?.pages||[]);
 $('performanceText').textContent=(perf?t('currentSession')+' '+t('performanceStats',{loads:fmt(perf.loads),reuse:fmt(perf.reusedClicks),hits:fmt(perf.cacheHits),mb:(perf.cacheBytesSaved/1048576).toLocaleString(locale(),{maximumFractionDigits:2})})+' ':'')+t('skipStats',Object.fromEntries(Object.entries(skipped).map(([k,v])=>[k,fmt(v)])));
 const remaining=resumeRemaining(r);$('resumeCard').hidden=state.active||!remaining;
 $('resumeHelp').textContent=t('resumeHelp',{n:fmt(remaining)})+(state.local?'':' '+t('resumeLocal',{version:VERSION}));
 $('resumeBtn').disabled=!state.local||state.engineVersion!==VERSION;
}
$('eventView').onchange=e=>{state.eventView=e.target.value;state.groupFilter=null;state.page=0;render();};
$('category').onchange=e=>{state.category=e.target.value;state.groupFilter=null;state.page=0;render();};
$('clearGroup').onclick=()=>{state.groupFilter=null;state.eventView='groups';$('eventView').value='groups';state.page=0;render();};
$('resumeBtn').onclick=async()=>{try{
 const res=await fetch('/api/resume',{method:'POST',headers:{'Content-Type':'application/json','X-Atlas-Token':state.token},body:JSON.stringify({resume:state.report,maxPages:Number($('maxPages').value),speed:$('speed').value,resetPolicy:$('resetPolicy').value,assetCache:$('assetCache').checked})});
 const data=await res.json();if(!res.ok)throw Error(data.error);state.report=null;state.active=true;state.groupFilter=null;state.page=0;state.pageTable=0;notice('resuming');render();setTimeout(poll,500);
 }catch(err){notice(err.message);}};

languageChanged();await localStatus();if(location.hash==='#timeline')tab('timeline');if(location.hash==='#map')tab('map');
render();setInterval(renderTimer,1000);if(state.active)setTimeout(poll,2000);
