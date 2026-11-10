import {t,locale} from './i18n.js';
import {formatDuration} from './model.js';
import {buildWebsiteTree,pathDepth,validateWebsiteMap,websiteMapRows,websiteMapCsv} from './website-map-model.js';
import {renderWebsiteGraph} from './website-map-graph.js';
import {createWebsiteMapComparison} from './website-map-compare.js';

const $=id=>document.getElementById(id);
const PAGE_SIZE=40;
const fmt=value=>Number(value).toLocaleString(locale());

function download(content,type,name) {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

export function createWebsiteMapView({auditUrl,openPage=()=>{},projectId=()=>null,onResults=()=>{},attachReport=async()=>{}}) {
  let token='';
  let report;
  let imported=false;
  let active=false;
  let visible=false;
  let busy=false;
  let page=0;
  let timer;
  let generation=0;
  let trail=[];
  let start='/';
  let selected='/';
  let selectedOnly=false;
  let expanded=new Set();
  let notice='';
  let requestPending=false;
  let history=[];
  let engineWarning='';
  let zoom=1;
  let graphTree=new Map();
  let graphKey,tableKey;
  const comparison=createWebsiteMapComparison({current:()=>report,download,
    readSaved:async id=>(await request('report?'+new URLSearchParams({id}))).report,
    onIssue:key=>{notice=key;render();}});

  function duration(){
    if(imported||report?.status!=='running')return report?.durationMs||0;
    return (report.previousDurationMs||0)+Date.now()-Date.parse(report.sessionStartedAt||report.startedAt);
  }
  function syncOptions(){
    if(!report?.options)return;
    const options=report.options;
    $('mapDomain').value=report.root;
    for(const [id,value] of [['mapLimit',options.maxPages||1000],['mapConcurrency',options.concurrency||3],
      ['mapScanDepth',options.maxScanDepth??'']]){
      const field=$(id),text=String(value);
      if(![...field.options].some(option=>option.value===text))field.add(new Option(text,text));
      field.value=text;
    }
    $('mapMethod').value=options.method||(options.rendered?'javascript':'links');
    for(const [id,value]of [['mapMaxSitemaps',options.maxSitemaps||500],['mapNavigationTimeout',options.navigationTimeoutMs||30000],['mapJavaScriptWait',options.javascriptWaitMs??900]]){
      const field=$(id),text=String(value);if(![...field.options].some(o=>o.value===text))field.add(new Option(text,text));field.value=text;
    }
    $('mapSitemapUrls').value=(options.sitemapUrls||[]).join('\n');
    $('mapScope').value=options.scope||'site';$('mapIncludePath').value=options.includePath||'/';
    $('mapExcludePaths').value=(options.excludePaths||[]).join(', ');$('mapKeepQuery').checked=options.keepQuery===true;
  }

  async function request(action,body) {
    if (!token) throw Error('mapLocalRequired');
    const response=await fetch('/api/website-map/'+action,{
      method:body?'POST':'GET',headers:{'X-Atlas-Token':token,...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)
    });
    const data=await response.json();
    if (!response.ok) throw Error(data.error || 'mapDisconnected');
    return data;
  }
  function filters() {
    return {prefix:$('mapPathFilter').value.trim() || '/',query:$('mapSearch').value,
      depth:$('mapDepth').value,status:$('mapStatusFilter').value};
  }
  function rows() {
    const all=websiteMapRows(report,filters());
    return selectedOnly?all.filter(row=>new URL(row.url).pathname.replace(/\/$/,'')===(selected==='/'?'':selected)):all;
  }
  function resetNavigation() {
    page=0;trail=[];start='/';selected='/';selectedOnly=false;expanded=new Set();
    $('mapPathFilter').value='';$('mapSearch').value='';$('mapDepth').value='';$('mapStatusFilter').value='all';
    $('mapNodeSearch').value='';zoom=1;
  }
  function cell(row,text,cls) {
    const node=row.insertCell();node.textContent=text;if(cls)node.className=cls;return node;
  }
  function renderTable() {
    const filtered=rows();
    const folders=$('mapTableMode').value==='folders';
    const tree=folders&&report?buildWebsiteTree(filtered,report.root):new Map();
    const items=folders?[...tree.values()].filter(node=>node.id!=='/'):filtered;
    const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
    page=Math.min(page,pages-1);
    const head=$('mapTableHead');head.replaceChildren();
    head.closest('table').dataset.mode=folders?'folders':'pages';
    for(const key of folders?['mapPath','mapUrls','mapShare','mapDepthLabel']:['mapUrl','mapPageTitle','mapDepthLabel','mapStatus','mapHttp','mapSource','mapAction']){
      const th=document.createElement('th');th.textContent=t(key);head.append(th);
    }
    const fragment=document.createDocumentFragment();
    for(const item of items.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)){
      const row=document.createElement('tr');
      if(folders){
        const where=row.insertCell();
        const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent=item.id;
        button.onclick=()=>select(item,0,true);where.append(button);
        cell(row,fmt(item.count));cell(row,new Intl.NumberFormat(locale(),{style:'percent',maximumFractionDigits:1}).format(item.count/Math.max(filtered.length,1)));
        cell(row,fmt(item.depth));
      }else{
        const where=row.insertCell();const link=document.createElement('a');link.href=item.url;link.target='_blank';link.rel='noreferrer';link.textContent=item.url;link.className='map-url';where.append(link);
        cell(row,item.title || '—');cell(row,pathDepth(item.url));
        const status=cell(row,t('mapStatus_'+item.status));status.title=item.error?t(item.error):'';
        if(item.error){const note=document.createElement('small');note.textContent=t(item.error);status.append(note);}
        cell(row,item.httpStatus || '—');cell(row,t('mapSource_'+item.source));
        const action=row.insertCell();const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent=t('mapAuditUrl');
        button.onclick=()=>auditUrl(item.url);action.append(button);
        const detail=document.createElement('button');detail.type='button';detail.className='text-button';detail.textContent=t('projectOpenPage');
        detail.onclick=()=>openPage(item.url);action.append(detail);
      }
      fragment.append(row);
    }
    $('mapTableRows').replaceChildren(fragment);
    $('mapEmpty').hidden=items.length>0;
    $('mapTableCount').textContent=t('mapTableCount',{n:fmt(items.length),urls:fmt(filtered.length)});
    $('mapTablePage').textContent=(page+1)+' / '+pages;
    $('mapPrevious').disabled=page===0;$('mapNext').disabled=page>=pages-1;
    $('mapDownloadFiltered').disabled=!filtered.length;
  }
  function select(node,index,starting=false) {
    const id=node.terminal?node.parentId:node.id;
    selected=id;
    selectedOnly=!!node.terminal;
    $('mapPathFilter').value=id;
    if(starting){start=id;trail=[];expanded.clear();}
    else if(index===0)trail=[];
    else {
      const parts=id.split('/').filter(Boolean);
      const depth=start==='/'?0:start.split('/').filter(Boolean).length;
      trail=parts.slice(depth).map((_,offset)=>'/'+parts.slice(0,depth+offset+1).join('/'));
      if(node.terminal)trail.push(node.id);
    }
    page=0;render();
  }
  function renderGraph() {
    const filtered=websiteMapRows(report,{query:$('mapSearch').value,depth:$('mapDepth').value,status:$('mapStatusFilter').value});
    const tree=report?buildWebsiteTree(filtered,report.root):new Map();
    graphTree=tree;
    const choice=$('mapStartingPoint');
    choice.replaceChildren();
    for(const node of [...tree.values()].filter(node=>node.id==='/'||node.children.length||node.id===start).sort((a,b)=>a.id.localeCompare(b.id))){
      choice.add(new Option(node.id==='/'?new URL(report.root).host:node.id,node.id));
    }
    if(!tree.has(start))start='/';
    choice.value=start;choice.disabled=!tree.size;
    const graph=$('mapGraph'),left=graph.scrollLeft,top=graph.scrollTop;
    const focus=graph.contains(document.activeElement)?document.activeElement.getAttribute('data-path'):null;
    renderWebsiteGraph(graph,tree,{start,trail,expanded,onSelect:select,onMore:id=>{expanded.add(id);renderGraph();}});
    const svg=graph.querySelector('svg');
    if(svg){svg.dataset.width=svg.getAttribute('width');svg.dataset.height=svg.getAttribute('height');}
    applyZoom();graph.scrollLeft=left;graph.scrollTop=top;
    if(focus){const target=[...graph.querySelectorAll('[role="button"]')].find(node=>node.getAttribute('data-path')===focus);target?.focus({preventScroll:true});}
    renderBreadcrumb();renderNodeSearch();
    $('mapSelection').textContent=t('mapSelection',{path:selectedOnly?selected+' · '+t('mapThisPage'):$('mapPathFilter').value||'/'});
    $('mapGraphEmpty').hidden=!!tree.get('/')?.count;
  }
  function focusPath(id){
    const node=graphTree.get(id);if(!node)return;
    start=id;selected=id;selectedOnly=false;trail=[];expanded.clear();$('mapPathFilter').value=id;page=0;render();
  }
  function renderBreadcrumb(){
    const parent=$('mapBreadcrumb');parent.replaceChildren();
    if(!report)return;
    const parts=(selected||start).split('/').filter(Boolean);
    const paths=['/',...parts.map((_,index)=>'/'+parts.slice(0,index+1).join('/'))];
    for(const [index,id] of paths.entries()){
      if(index){const separator=document.createElement('span');separator.textContent='›';parent.append(separator);}
      const button=document.createElement('button');button.type='button';button.className='text-button';
      button.textContent=id==='/'?new URL(report.root).host:graphTree.get(id)?.label||parts[index-1];
      button.onclick=()=>focusPath(id);parent.append(button);
    }
  }
  function renderNodeSearch(){
    const target=$('mapNodeResults');target.replaceChildren();
    const value=$('mapNodeSearch').value.trim().toLowerCase();
    if(!value)return;
    const nodes=[...graphTree.values()].filter(node=>node.id.toLowerCase().includes(value)||node.label.toLowerCase().includes(value)).slice(0,12);
    if(!nodes.length)target.textContent=t('mapNodeNotFound');
    for(const node of nodes){const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent=node.id+' · '+fmt(node.count);button.onclick=()=>{$('mapNodeSearch').value='';focusPath(node.id);};target.append(button);}
  }
  function applyZoom(){
    const svg=$('mapGraph').querySelector('svg');
    if(svg){svg.setAttribute('width',Number(svg.dataset.width)*zoom);svg.setAttribute('height',Number(svg.dataset.height)*zoom);}
    $('mapZoom').value=String(Math.round(zoom*100));$('mapZoomValue').textContent=Math.round(zoom*100)+'%';
  }
  function render() {
    const locked=busy||active;
    for(const field of $('mapForm').elements)field.disabled=locked;
    $('mapStart').disabled=locked||!token;
    $('mapStop').hidden=!active;$('mapStop').disabled=busy;
    $('mapStart').hidden=active;
    $('mapIncludeField').hidden=$('mapScope').value!=='subfolder';
    $('mapIncludePath').required=$('mapScope').value==='subfolder';
    $('mapJavaScriptWait').disabled=locked||$('mapMethod').value!=='javascript';
    $('mapBrowserConnect').disabled=locked||!token;$('mapBrowserCopy').disabled=!$('mapBrowserCode').value;
    $('mapStart').textContent=t($('mapMethod').value==='browser'?'mapBrowserConnect':'mapStart');
    $('mapDownloadAll').disabled=!report?.pages.length;
    $('mapDownloadJson').disabled=!report?.pages.length;
    $('mapAttachProject').disabled=!report||active||busy;
    $('mapDownloadGraph').disabled=!$('mapGraph').querySelector('svg');
    const counts={ok:0,redirect:0,error:0,skipped:0,discovered:0,loading:0};
    for(const row of report?.pages||[])counts[row.status]=(counts[row.status]||0)+1;
    const summary={ok:counts.ok,redirect:counts.redirect,failed:counts.error,skipped:counts.skipped,pending:counts.discovered+counts.loading};
    summary.inspected=summary.ok+summary.redirect+summary.failed;
    $('mapFound').textContent=fmt(report?.pages.length||0);
    $('mapInspected').textContent=fmt(summary.inspected||0);
    $('mapFailed').textContent=fmt(summary.failed||0);
    $('mapLoaded').textContent=fmt(summary.ok);$('mapRedirects').textContent=fmt(summary.redirect);
    $('mapSkipped').textContent=fmt(summary.skipped);$('mapPending').textContent=fmt(summary.pending);
    $('mapVerification').textContent=fmt((report?.pages||[]).filter(p=>p.accessIssue).length);
    const discovery=report?.discovery;
    $('mapDiscoveryStatus').textContent=discovery?t('mapDiscoveryProgress',{read:fmt(discovery.sitemapsRead),found:fmt(discovery.sitemapsFound),pending:fmt(discovery.sitemapsPending),failed:fmt(discovery.sitemapsFailed)}):'';
    $('mapSingleUrlHelp').hidden=report?.pages.length!==1||active;
    if(report?.browserCapture)$('mapBrowserStatus').textContent=t('mapBrowserCaptured',{pages:fmt(report.browserCapture.pages),url:report.browserCapture.lastPage});
    $('mapReportStatus').textContent=t('mapRun_'+(report?.status||'idle'))+(imported?' · '+t('mapImported'):'');
    $('mapRoot').textContent=report?.root || '';
    $('mapDuration').textContent=formatDuration(duration());
    const canResume=report && (['stopped','interrupted','limited','error','partial'].includes(report.status)||summary.failed>0);
    $('mapResumePanel').hidden=!canResume||active;$('mapResume').disabled=busy||!token;
    const checkpoint=report?.checkpoint;
    $('mapSaveStatus').textContent=imported?t('mapImportedSaveHelp'):checkpoint?.error?t('mapSaveError',{error:checkpoint.error}):checkpoint?.savedAt
      ?t('mapSavedAt',{time:new Date(checkpoint.savedAt).toLocaleTimeString(locale())}):active?t('mapSavePending'):'';
    const previousHistory=$('mapHistory').value;
    $('mapHistory').replaceChildren(new Option(t('mapChooseScan'),''));
    for(const item of history)$('mapHistory').add(new Option(item.root+' · '+new Date(item.startedAt).toLocaleString(locale()),item.id));
    $('mapHistory').value=previousHistory;$('mapOpenHistory').disabled=active||busy||!$('mapHistory').value;
    $('mapDeleteHistory').disabled=active||busy||!$('mapHistory').value;
    const messages=[notice,engineWarning,report?.error,report?.status==='limited'?'mapLimitNote':''].filter(Boolean);
    $('mapNotice').textContent=messages.map(key=>t(key)).join(' ');$('mapNotice').hidden=!messages.length;
    $('mapWarnings').hidden=!report?.warnings?.length;
    $('mapWarningList').replaceChildren();
    for(const warning of (report?.warnings||[]).slice(0,100)){
      const li=document.createElement('li');li.textContent=[warning.url,t(warning.error)].filter(Boolean).join(' · ');$('mapWarningList').append(li);
    }
    const dataKey=JSON.stringify([report?.id,report?.dataRevision??report?.revision,imported,locale()]);
    const nextGraphKey=JSON.stringify([report?.id,report?.pages.length,$('mapSearch').value,$('mapDepth').value,$('mapStatusFilter').value,
      $('mapSearch').value||$('mapStatusFilter').value!=='all'?dataKey:'',start,trail,[...expanded],locale()]);
    if(graphKey!==nextGraphKey){renderGraph();graphKey=nextGraphKey;}
    else $('mapSelection').textContent=t('mapSelection',{path:selectedOnly?selected+' · '+t('mapThisPage'):$('mapPathFilter').value||'/'});
    const nextTableKey=JSON.stringify([dataKey,filters(),$('mapTableMode').value,page,selectedOnly,selected]);
    if(tableKey!==nextTableKey){renderTable();tableKey=nextTableKey;}
    comparison.render(history);
    $('mapDownloadGraph').disabled=!$('mapGraph').querySelector('svg');
  }
  async function refresh() {
    clearTimeout(timer);
    if(!visible||!token||requestPending)return;
    requestPending=true;
    const started=generation;
    try{
      const query=new URLSearchParams(projectId()?{projectId:projectId()}:{});
      if(report&&!imported){query.set('reportId',report.id);query.set('dataRevision',report.dataRevision??report.revision);}
      const data=await request('status?'+query);
      if(started!==generation)return;
      const changed=active!==data.active || !imported&&!data.unchanged && (report?.id!==data.report?.id || report?.revision!==data.report?.revision);
      const historyChanged=JSON.stringify(history)!==JSON.stringify(data.history||[]);
      history=data.history||[];engineWarning=data.warning||'';
      const wasActive=active;
      active=data.active;
      if(wasActive&&!active)void onResults();
      if(!imported){if(data.unchanged){Object.assign(report,data.meta);$('mapSaveStatus').textContent=report.checkpoint?.savedAt?t('mapSavedAt',{time:new Date(report.checkpoint.savedAt).toLocaleTimeString(locale())}):'';}
        else {const newId=report?.id!==data.report?.id;report=data.report || undefined;if(newId)syncOptions();}}
      const hadNotice=notice==='mapDisconnected';
      if(hadNotice || notice==='mapStopping'&&!active)notice='';
      if(changed || hadNotice || historyChanged)render();
      else if(report?.status==='running')$('mapDuration').textContent=formatDuration(duration());
    }catch(failure){notice=failure.message;render();}
    finally{requestPending=false;if(visible)timer=setTimeout(refresh,1200);}
  }
  function formOptions(){let url=$('mapDomain').value.trim();if(!/^https?:\/\//i.test(url))url='https://'+url;
    return {url,projectId:projectId(),maxPages:Number($('mapLimit').value),concurrency:Number($('mapConcurrency').value),
      method:$('mapMethod').value,scope:$('mapScope').value,includePath:$('mapIncludePath').value,excludePaths:$('mapExcludePaths').value,
      maxScanDepth:$('mapScanDepth').value,keepQuery:$('mapKeepQuery').checked,maxSitemaps:Number($('mapMaxSitemaps').value),
      navigationTimeoutMs:Number($('mapNavigationTimeout').value),javascriptWaitMs:Number($('mapJavaScriptWait').value),sitemapUrls:$('mapSitemapUrls').value};}
  async function prepareBrowser(){
    if(active||busy||!$('mapForm').reportValidity())return;
    busy=true;generation++;notice='';render();
    try{const result=await request('browser/prepare',{...formOptions(),report});
      $('mapBrowserCode').value=result.code;$('mapBrowserPanel').open=true;
      $('mapBrowserStatus').textContent=t('mapBrowserReady',{time:new Date(result.expiresAt).toLocaleTimeString(locale())});
      imported=false;void onResults();
    }catch(failure){notice=failure.message;}
    finally{busy=false;render();void refresh();}
  }
  $('mapBrowserConnect').onclick=()=>{$('mapMethod').value='browser';void prepareBrowser();};
  $('mapBrowserCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('mapBrowserCode').value);}catch{$('mapBrowserCode').select();}};
  $('mapMethod').onchange=render;
  $('mapForm').onsubmit=async event=>{
    event.preventDefault();if($('mapMethod').value==='browser'){void prepareBrowser();return;}if(busy)return;busy=true;generation++;notice='';render();
    try{
      await request('start',formOptions());
      imported=false;active=true;report=undefined;resetNavigation();
      void onResults();
    }catch(failure){notice=failure.message;}
    finally{busy=false;render();void refresh();}
  };
  $('mapStop').onclick=async()=>{try{await request('stop',{});notice='mapStopping';render();void refresh();}catch(failure){notice=failure.message;render();}};
  $('mapResume').onclick=async()=>{
    if(report?.options.method==='browser'){$('mapMethod').value='browser';void prepareBrowser();return;}
    if(busy||active)return;busy=true;generation++;notice='';render();
    try{await request('resume',{...formOptions(),report});imported=false;active=true;}
    catch(failure){notice=failure.message;}finally{busy=false;render();void refresh();}
  };
  $('mapScope').onchange=render;
  $('mapHistory').onchange=()=>{$('mapOpenHistory').disabled=active||busy||!$('mapHistory').value;$('mapDeleteHistory').disabled=active||busy||!$('mapHistory').value;};
  $('mapDeleteHistory').onclick=async()=>{
    const entry=history.find(item=>item.id===$('mapHistory').value);if(!entry||active||busy)return;
    if(!confirm(t('mapDeleteConfirm',{site:entry.root,date:new Date(entry.startedAt).toLocaleString(locale())})))return;
    busy=true;generation++;render();
    try{await request('delete',{id:entry.id});history=history.filter(item=>item.id!==entry.id);
      if(report?.id===entry.id){report=undefined;imported=false;resetNavigation();graphKey=undefined;tableKey=undefined;}
      comparison.remove(entry.id);notice='mapDeleted';void onResults();
    }catch(failure){notice=failure.message;}
    finally{busy=false;render();void refresh();}
  };
  $('mapOpenHistory').onclick=async()=>{
    if(active||busy)return;busy=true;generation++;render();
    try{report=validateWebsiteMap((await request('report?'+new URLSearchParams({id:$('mapHistory').value}))).report);imported=true;resetNavigation();syncOptions();}
    catch(failure){notice=failure.message;}finally{busy=false;render();}
  };
  for(const button of document.querySelectorAll('[data-map-status]'))button.onclick=()=>{resetNavigation();$('mapStatusFilter').value=button.dataset.mapStatus;render();};
  for(const id of ['mapSearch','mapPathFilter','mapDepth','mapStatusFilter','mapTableMode'])$(id).addEventListener(id==='mapSearch'||id==='mapPathFilter'?'input':'change',()=>{
    page=0;
    if(id==='mapPathFilter'){
      selectedOnly=false;selected=$(id).value||'/';start=selected.replace(/\/$/,'')||'/';trail=[];expanded.clear();
    }
    render();
  });
  $('mapStartingPoint').onchange=()=>{start=$('mapStartingPoint').value;selected=start;selectedOnly=false;trail=[];expanded.clear();$('mapPathFilter').value=start;page=0;render();};
  $('mapReset').onclick=()=>{resetNavigation();render();};
  $('mapNodeSearch').oninput=renderNodeSearch;
  $('mapZoom').oninput=()=>{zoom=Number($('mapZoom').value)/100;applyZoom();};
  $('mapZoomIn').onclick=()=>{zoom=Math.min(2,zoom+0.25);applyZoom();};
  $('mapZoomOut').onclick=()=>{zoom=Math.max(0.25,zoom-0.25);applyZoom();};
  $('mapFit').onclick=()=>{const svg=$('mapGraph').querySelector('svg');if(svg){zoom=Math.max(0.25,Math.min(2,($('mapGraph').clientWidth-20)/Number(svg.dataset.width)));applyZoom();$('mapGraph').scrollTo(0,0);}};
  let drag;
  $('mapGraph').addEventListener('pointerdown',event=>{
    if(event.pointerType!=='mouse'||event.button!==0||event.target.closest('[role="button"]'))return;
    drag={x:event.clientX,y:event.clientY,left:$('mapGraph').scrollLeft,top:$('mapGraph').scrollTop};
    $('mapGraph').setPointerCapture(event.pointerId);$('mapGraph').classList.add('dragging');
  });
  $('mapGraph').addEventListener('pointermove',event=>{if(drag){$('mapGraph').scrollLeft=drag.left+drag.x-event.clientX;$('mapGraph').scrollTop=drag.top+drag.y-event.clientY;}});
  const stopDrag=()=>{drag=undefined;$('mapGraph').classList.remove('dragging');};
  $('mapGraph').addEventListener('pointerup',stopDrag);$('mapGraph').addEventListener('pointercancel',stopDrag);
  $('mapPrevious').onclick=()=>{page--;renderTable();};$('mapNext').onclick=()=>{page++;renderTable();};
  $('mapDownloadAll').onclick=()=>download(websiteMapCsv(report.pages),'text/csv;charset=utf-8','website-map-all.csv');
  $('mapDownloadFiltered').onclick=()=>download(websiteMapCsv(rows()),'text/csv;charset=utf-8','website-map-filtered.csv');
  $('mapDownloadJson').onclick=()=>download(JSON.stringify({...report,durationMs:duration()},null,2),'application/json','website-map.json');
  $('mapAttachProject').onclick=async()=>{try{const value=report;await attachReport(value);report=value;imported=true;graphKey=undefined;tableKey=undefined;syncOptions();notice='projectAttached';render();}catch(failure){notice=failure.message;render();}};
  $('mapDownloadGraph').onclick=()=>{
    const svg=$('mapGraph').querySelector('svg').cloneNode(true);
    const style=document.createElementNS('http://www.w3.org/2000/svg','style');
    svg.classList.remove('map-highlighting');
    style.textContent='.map-flow{fill-opacity:.45}.map-flow.map-route{fill-opacity:.75}text{font-family:Arial,sans-serif;fill:#1e293b;font-size:12px}.map-node-count{font-weight:bold;font-size:11px}.map-column-heading{font-size:11px;fill:#64748b}';
    svg.prepend(style);download(new XMLSerializer().serializeToString(svg),'image/svg+xml','website-map-path.svg');
  };
  return {
    render,
    connect(value){token=value;if(visible)void refresh();},
    show(value){visible=value;clearTimeout(timer);if(value){render();void refresh();}},
    projectChanged(project){generation++;imported=false;report=undefined;history=[];graphKey=undefined;tableKey=undefined;notice='';$('mapBrowserCode').value='';$('mapBrowserStatus').textContent='';resetNavigation();comparison.clear();if(project)$('mapDomain').value=project.root;if(visible)void refresh();},
    focusUrl(url){const path=new URL(url).pathname;start=path;selected=path;selectedOnly=true;trail=[];$('mapPathFilter').value=path;page=0;graphKey=undefined;render();},
    load(value){if(active)throw Error(t('mapBusy'));report=validateWebsiteMap(value);imported=true;resetNavigation();syncOptions();render();}
  };
}
