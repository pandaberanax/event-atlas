import {t,locale,applyLanguage} from './i18n.js';
import {projectUrl} from './project-model.js';
import {eventPlatform,platformName} from './platforms.js';
const $=id=>document.getElementById(id);
const fmt=n=>Number(n||0).toLocaleString(locale());
const short=url=>{const u=new URL(url);return u.pathname+u.search+u.hash;};
const date=value=>value?new Date(value).toLocaleString(locale()):'—';

export function createProjects({onSelect,auditUrl,openRun,openEvents,openTimeline,openMap}){
  let token='',data={projects:[],activeId:null},inventory=[],visible=false,timer,pending=false,queued=false,page=0,notice='',details,selectedSource=0,generation=0,lastRuns=[],inventoryKey='';
  const active=()=>data.projects.find(p=>p.id===data.activeId);
  $('projectView').innerHTML=`<div class="project-title"><div class="eyebrow">PROJECT WORKSPACE</div><h1 data-i18n="projectTitle"></h1><p data-i18n="projectSubtitle"></p><div class="project-tools"><button id="projectMap" class="button primary" data-i18n="projectMap"></button><button id="projectAudit" class="button secondary" data-i18n="start"></button></div></div>
    <p id="projectNotice" class="notice project-notice" role="status"></p>
    <div id="projectEmpty" class="table-card project-empty"><p data-i18n="projectCreateHelp"></p><button id="projectCreateEmpty" class="text-button" data-i18n="projectNew"></button></div>
    <div id="projectContent" hidden><div class="project-metrics"><article class="table-card"><span data-i18n="projectUrls"></span><strong id="projectUrlCount">0</strong></article><article class="table-card"><span data-i18n="projectMapRuns"></span><strong id="projectMapCount">0</strong></article><article class="table-card"><span data-i18n="projectAuditRuns"></span><strong id="projectAuditCount">0</strong></article></div>
    <div class="section-heading"><div><h2 data-i18n="projectInventory"></h2><p data-i18n="projectInventoryHelp"></p></div></div>
    <section class="table-card project-inventory"><div class="table-toolbar"><label class="search"><span>⌕</span><input id="projectSearch" type="search" data-i18n-placeholder="projectSearch" data-i18n-aria="projectSearch"></label></div><div class="table-scroll"><table><thead><tr><th>URL</th><th data-i18n="projectLatestMap"></th><th data-i18n="projectLatestAudit"></th><th data-i18n="projectObserved"></th><th></th></tr></thead><tbody id="projectRows"></tbody></table></div><p id="projectNoPages" class="project-empty" data-i18n="projectNoPages"></p><footer class="table-footer"><span id="projectRowCount"></span><div><button id="projectPrevious" class="pager" data-i18n-aria="prev">←</button><span id="projectPageNumber"></span><button id="projectNext" class="pager" data-i18n-aria="next">→</button></div></footer></section>
    <h3 data-i18n="projectRuns"></h3><div id="projectRuns" class="project-runs"></div></div>`;
  const modal=document.createElement('dialog');modal.id='projectCreateDialog';modal.className='project-modal';
  modal.innerHTML=`<form id="projectCreateForm"><h2 data-i18n="projectNew"></h2><p data-i18n="projectCreateHelp"></p><label><span data-i18n="projectName"></span><input id="projectName" required maxlength="120" autocomplete="off"></label><label><span data-i18n="projectWebsite"></span><input id="projectWebsite" required placeholder="https://example.com" autocomplete="url"></label><p id="projectCreateError" class="notice" role="alert" hidden></p><div class="project-tools"><button id="projectCancel" class="button secondary" type="button" data-i18n="projectCancel"></button><button id="projectCreate" class="button primary" type="submit" data-i18n="projectCreate"></button></div></form>`;
  document.body.append(modal);
  const dialog=document.createElement('dialog');dialog.id='projectPageDialog';dialog.className='project-page-dialog';
  dialog.innerHTML=`<div class="project-dialog-heading"><h2 data-i18n="projectDetails"></h2><button id="projectPageClose" class="pager" data-i18n-aria="close">×</button></div><p id="projectPageUrl" class="project-page-url"></p><p id="projectPageError" class="notice" hidden></p><div class="project-tools"><button id="projectPageAudit" class="button primary" data-i18n="projectAudit"></button><button id="projectPageEvents" class="button secondary" data-i18n="projectEvents"></button><button id="projectPageMap" class="button secondary" data-i18n="projectMapPath"></button><button id="projectPageTimeline" class="button secondary" data-i18n="projectTimeline"></button></div><p class="map-help" data-i18n="projectTimelineNote"></p><label class="project-select-field"><span data-i18n="projectSources"></span><select id="projectPageSource"></select></label><div id="projectPageMeta" class="project-source-meta"></div><p class="map-help" data-i18n="projectPageNote"></p><div id="projectPageBody"></div>`;
  document.body.append(dialog);
  async function request(action,body){
    if(!token)throw Error('projectLocal');
    const response=await fetch('/api/projects/'+action,{method:body?'POST':'GET',headers:{'X-Atlas-Token':token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(30000)});
    const result=await response.json();if(!response.ok)throw Error(result.error||'projectStorageError');return result;
  }
  function renderPicker(){
    const field=$('projectSelect');field.replaceChildren(new Option(t('projectNone'),''));
    for(const p of data.projects)field.add(new Option(p.name,p.id));field.value=data.activeId||'';field.disabled=data.busy||!token;
    $('projectRoot').textContent=active()?.root||'';$('projectNew').disabled=data.busy||!token;
    $('projectContext').textContent=active()?t('projectCurrent',{name:active().name}):t('projectNone');
  }
  function render(){
    renderPicker();$('projectEmpty').hidden=!!active();$('projectContent').hidden=!active();
    $('projectMap').disabled=!token;$('projectAudit').disabled=!token;
    $('projectNotice').textContent=notice?t(notice):'';
    $('projectUrlCount').textContent=fmt(inventory.length);$('projectMapCount').textContent=fmt(active()?.scans);$('projectAuditCount').textContent=fmt(active()?.audits);
    const text=$('projectSearch').value.toLowerCase(),rows=inventory.filter(p=>[p.url,p.title].join(' ').toLowerCase().includes(text));
    const pages=Math.max(1,Math.ceil(rows.length/30));page=Math.min(page,pages-1);
    const fragment=document.createDocumentFragment();
    for(const item of rows.slice(page*30,page*30+30)){
      const tr=document.createElement('tr'),cell=tr.insertCell(),button=document.createElement('button');button.className='text-button';button.textContent=short(item.url);button.title=item.url;
      button.onclick=()=>void showPage(item.url);cell.append(button);
      const title=document.createElement('small');title.className='table-sub';title.textContent=item.title;cell.append(title);
      tr.insertCell().textContent=item.map?t('mapStatus_'+item.map.status):t('projectNotMapped');
      tr.insertCell().textContent=item.audit?t(item.audit.status):t('projectNotAudited');
      tr.insertCell().textContent=item.audit?fmt(item.events):'—';
      const detail=document.createElement('button');detail.className='text-button';detail.textContent=t('viewDetails');detail.onclick=()=>void showPage(item.url);tr.insertCell().append(detail);fragment.append(tr);
    }
    $('projectRows').replaceChildren(fragment);$('projectNoPages').hidden=rows.length>0;
    $('projectRowCount').textContent=fmt(rows.length)+' URL';$('projectPageNumber').textContent=(page+1)+' / '+pages;
    $('projectPrevious').disabled=page===0;$('projectNext').disabled=page>=pages-1;
    renderRuns(lastRuns);
  }
  function renderRuns(runs=[]){
    const fragment=document.createDocumentFragment();
    for(const run of [...runs].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,20)){
      const row=document.createElement('article');row.className='project-run';
      const title=document.createElement('div');title.textContent=(run.kind==='map'?'Website Map':t('auditTitle'))+' · '+date(run.startedAt);
      const sub=document.createElement('small');sub.textContent='v'+run.appVersion+' · '+fmt(run.urls)+' URL · '+t(run.kind==='map'?'mapRun_'+run.status:run.status);title.append(sub);
      const button=document.createElement('button');button.className='text-button';button.textContent=t('projectOpenRun');
      button.onclick=async()=>{try{const {report}=await request('report?'+new URLSearchParams({id:data.activeId,key:run.key}));openRun(report);}catch(error){notice=error.message;render();}};
      row.append(title,button);fragment.append(row);
    }
    $('projectRuns').replaceChildren(fragment);
  }
  async function refresh(){
    clearTimeout(timer);if(!token)return;if(pending){queued=true;return;}
    pending=true;const turn=generation;
    try{
      const next=await request('status');if(turn!==generation)return;
      const changed=data.activeId!==next.activeId;data=next;
      if(changed){inventory=[];lastRuns=[];inventoryKey='';page=0;await onSelect(active());}
      renderPicker();
      const nextKey=data.activeId+':'+active()?.revision;
      if(visible&&data.activeId&&inventoryKey!==nextKey){const result=await request('inventory?'+new URLSearchParams({id:data.activeId}));if(turn!==generation)return;inventory=result.pages;notice=result.missing?t('projectMissingSources',{n:result.missing}):'';lastRuns=result.project.runs;inventoryKey=nextKey;}
      render();
    }catch(error){notice=error.message;render();}
    finally{pending=false;if(queued){queued=false;void refresh();}else if(visible)timer=setTimeout(refresh,3000);}
  }
  function create(){if(data.busy){notice='projectBusy';render();return;}$('projectCreateError').hidden=true;if(!modal.open)modal.showModal();$('projectName').focus();}
  $('projectNew').onclick=create;$('projectCreateEmpty').onclick=create;$('projectCancel').onclick=()=>modal.close();
  $('projectCreateForm').onsubmit=async event=>{
    event.preventDefault();$('projectCreate').disabled=true;
    try{let url=$('projectWebsite').value.trim();if(!/^https?:\/\//i.test(url))url='https://'+url;
      await request('create',{name:$('projectName').value,url});modal.close();generation++;await refresh();
    }catch(error){$('projectCreateError').textContent=t(error.message);$('projectCreateError').hidden=false;}
    finally{$('projectCreate').disabled=false;}
  };
  $('projectSelect').onchange=async()=>{
    if(!$('projectSelect').value){renderPicker();return;}
    try{await request('select',{id:$('projectSelect').value});generation++;await refresh();}
    catch(error){notice=error.message;render();}
  };
  $('projectSearch').oninput=()=>{page=0;render();};$('projectPrevious').onclick=()=>{page--;render();};$('projectNext').onclick=()=>{page++;render();};
  $('projectMap').onclick=()=>openMap(undefined,active()?.root);$('projectAudit').onclick=()=>auditUrl(active()?.root||'');
  async function showPage(value){
    const url=projectUrl(value);if(!url)return;
    details={url,matches:[]};selectedSource=0;$('projectPageUrl').textContent=url;$('projectPageBody').textContent=t('projectLoading');$('projectPageError').hidden=true;
    $('projectPageSource').replaceChildren();$('projectPageMeta').replaceChildren();$('projectPageEvents').disabled=true;$('projectPageMap').disabled=true;
    if(!dialog.open)dialog.showModal();
    try{const result=await request('page?'+new URLSearchParams({id:data.activeId||'',url}));if(details.url!==url)return;details=result;renderPage();}
    catch(error){$('projectPageError').textContent=t(error.message);$('projectPageError').hidden=false;$('projectPageBody').textContent='';}
  }
  function renderPage(){
    if(!details)return;
    const source=details.matches[selectedSource];
    const choice=$('projectPageSource');choice.replaceChildren();
    for(const [i,item]of details.matches.entries())choice.add(new Option((item.kind==='map'?'Website Map':t('auditTitle'))+' · '+date(item.startedAt)+' · v'+item.version,String(i)));
    choice.value=String(selectedSource);choice.disabled=!source;
    $('projectPageEvents').disabled=!details.matches.some(m=>m.kind==='audit');$('projectPageMap').disabled=!details.matches.some(m=>m.kind==='map');
    const meta=$('projectPageMeta');meta.replaceChildren();
    for(const value of [details.path,source?'v'+source.version:'',source?.page?.status?t(source.kind==='map'?'mapStatus_'+source.page.status:source.page.status):'',source?.page?.httpStatus?'HTTP '+source.page.httpStatus:'']){
      const span=document.createElement('span');span.textContent=value;meta.append(span);
    }
    const body=$('projectPageBody');body.replaceChildren();if(!source){body.textContent=t('projectNoPages');return;}
    if(source.page?.finalUrl&&source.page.finalUrl!==details.url){const p=document.createElement('p');p.textContent='→ '+source.page.finalUrl;body.append(p);}
    const page=document.createElement('details');page.innerHTML='<summary></summary><pre></pre>';page.querySelector('summary').textContent=t('detailsPage');page.querySelector('pre').textContent=JSON.stringify(source.page||{},null,2);body.append(page);
    const preview=document.createElement('p');preview.className='map-help';preview.textContent=t('projectPreview',{n:Math.min(50,source.events.length),total:source.events.length});body.append(preview);
    for(const event of source.events.slice(0,50)){
      const row=document.createElement('details');row.innerHTML='<summary></summary><pre></pre>';
      row.querySelector('summary').textContent=event.name+' · '+platformName(eventPlatform(event))+' · '+(event.element?.text||t(event.trigger||event.action||'page'));
      row.querySelector('pre').textContent=JSON.stringify({parameters:event.parameters||{},element:event.element,source:event.source,relationship:event.relationship,originPage:event.originPage||event.page,eventPage:event.eventPage||event.reportedPage,engineVersion:event.provenanceVersion||source.version},null,2);body.append(row);
    }
  }
  $('projectPageClose').onclick=()=>dialog.close();$('projectPageSource').onchange=()=>{selectedSource=Number($('projectPageSource').value);renderPage();};
  $('projectPageAudit').onclick=()=>{dialog.close();auditUrl(details.url);};
  $('projectPageTimeline').onclick=()=>{dialog.close();openTimeline(details.url);};
  $('projectPageEvents').onclick=async()=>{
    const selected=details.matches[selectedSource],source=selected?.kind==='audit'?selected:details.matches.find(s=>s.kind==='audit');
    try{const {report}=await request('report?'+new URLSearchParams({id:data.activeId,key:source.key}));dialog.close();openEvents(report,details.url);}
    catch(error){$('projectPageError').textContent=t(error.message);$('projectPageError').hidden=false;}
  };
  $('projectPageMap').onclick=async()=>{
    const selected=details.matches[selectedSource],source=selected?.kind==='map'?selected:details.matches.find(s=>s.kind==='map');
    try{const {report}=await request('report?'+new URLSearchParams({id:data.activeId,key:source.key}));dialog.close();openMap(report,details.url);}
    catch(error){$('projectPageError').textContent=t(error.message);$('projectPageError').hidden=false;}
  };
  return {
    get id(){return data.activeId;},get current(){return active();},request,refresh,showPage,
    async connect(value){const changed=token!==value;token=value;if(changed)await refresh();},
    show(value){visible=value;clearTimeout(timer);if(value)void refresh();},
    render(){render();if(dialog.open)renderPage();},
    async attach(report){const result=await request('attach',{report,projectId:data.activeId});report.projectId=result.projectId;await refresh();},
    async adoptLatest(){await refresh();}
  };
}
