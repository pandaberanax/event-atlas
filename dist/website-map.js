import {t,locale} from './i18n.js';
import {formatDuration} from './model.js';
import {buildWebsiteTree,pathDepth,validateWebsiteMap,websiteMapRows,websiteMapCsv} from './website-map-model.js';
import {renderWebsiteGraph} from './website-map-graph.js';

const $=id=>document.getElementById(id);
const PAGE_SIZE=40;
const fmt=value=>Number(value).toLocaleString(locale());

function download(content,type,name) {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

export function createWebsiteMapView({auditUrl}) {
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
  }
  function cell(row,text,cls) {
    const node=row.insertCell();node.textContent=text;if(cls)node.className=cls;return node;
  }
  function renderTable() {
    const filtered=rows();
    const folders=$('mapTableMode').value==='folders';
    const tree=report?buildWebsiteTree(filtered,report.root):new Map();
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
    const choice=$('mapStartingPoint');
    choice.replaceChildren();
    for(const node of [...tree.values()].filter(node=>node.id==='/'||node.children.length).sort((a,b)=>a.id.localeCompare(b.id))){
      choice.add(new Option(node.id==='/'?new URL(report.root).host:node.id,node.id));
    }
    if(!tree.has(start))start='/';
    choice.value=start;choice.disabled=!tree.size;
    renderWebsiteGraph($('mapGraph'),tree,{start,trail,expanded,onSelect:select,onMore:id=>{expanded.add(id);renderGraph();}});
    $('mapSelection').textContent=t('mapSelection',{path:selectedOnly?selected+' · '+t('mapThisPage'):$('mapPathFilter').value||'/'});
    $('mapGraphEmpty').hidden=!!tree.get('/')?.count;
  }
  function render() {
    const locked=busy||active;
    for(const field of $('mapForm').elements)field.disabled=locked;
    $('mapStart').disabled=locked||!token;
    $('mapStop').hidden=!active;$('mapStop').disabled=busy;
    $('mapStart').hidden=active;
    $('mapDownloadAll').disabled=!report?.pages.length;
    $('mapDownloadJson').disabled=!report?.pages.length;
    $('mapDownloadGraph').disabled=!$('mapGraph').querySelector('svg');
    const summary=report?.summary || {};
    $('mapFound').textContent=fmt(report?.pages.length||0);
    $('mapInspected').textContent=fmt(summary.inspected||0);
    $('mapFailed').textContent=fmt(summary.failed||0);
    $('mapReportStatus').textContent=t('mapRun_'+(report?.status||'idle'))+(imported?' · '+t('mapImported'):'');
    $('mapRoot').textContent=report?.root || '';
    $('mapDuration').textContent=formatDuration(report?.status==='running'?Date.now()-Date.parse(report.startedAt):report?.durationMs||0);
    const messages=[notice,report?.error,report?.status==='limited'?'mapLimitNote':''].filter(Boolean);
    $('mapNotice').textContent=messages.map(key=>t(key)).join(' ');$('mapNotice').hidden=!messages.length;
    $('mapWarnings').hidden=!report?.warnings?.length;
    $('mapWarningList').replaceChildren();
    for(const warning of (report?.warnings||[]).slice(0,100)){
      const li=document.createElement('li');li.textContent=[warning.url,t(warning.error)].filter(Boolean).join(' · ');$('mapWarningList').append(li);
    }
    renderGraph();renderTable();
    $('mapDownloadGraph').disabled=!$('mapGraph').querySelector('svg');
  }
  async function refresh() {
    clearTimeout(timer);
    if(!visible||!token||requestPending)return;
    requestPending=true;
    const started=generation;
    try{
      const data=await request('status');
      if(started!==generation)return;
      const changed=active!==data.active || !imported && (report?.id!==data.report?.id || report?.revision!==data.report?.revision);
      active=data.active;
      if(!imported)report=data.report || undefined;
      const hadNotice=!!notice;
      notice='';
      if(changed || hadNotice)render();
      else if(report?.status==='running')$('mapDuration').textContent=formatDuration(Date.now()-Date.parse(report.startedAt));
    }catch(failure){notice=failure.message;render();}
    finally{requestPending=false;if(visible)timer=setTimeout(refresh,1200);}
  }
  $('mapForm').onsubmit=async event=>{
    event.preventDefault();if(busy)return;busy=true;generation++;notice='';render();
    try{
      let url=$('mapDomain').value.trim();if(!/^https?:\/\//i.test(url))url='https://'+url;
      await request('start',{url,maxPages:Number($('mapLimit').value),concurrency:Number($('mapConcurrency').value),
        rendered:$('mapRendered').checked,keepQuery:$('mapKeepQuery').checked});
      imported=false;active=true;report=undefined;resetNavigation();
    }catch(failure){notice=failure.message;}
    finally{busy=false;render();void refresh();}
  };
  $('mapStop').onclick=async()=>{try{await request('stop',{});notice='mapStopping';render();void refresh();}catch(failure){notice=failure.message;render();}};
  for(const id of ['mapSearch','mapPathFilter','mapDepth','mapStatusFilter','mapTableMode'])$(id).addEventListener(id==='mapSearch'||id==='mapPathFilter'?'input':'change',()=>{
    page=0;
    if(id==='mapPathFilter'){
      selectedOnly=false;selected=$(id).value||'/';start=selected.replace(/\/$/,'')||'/';trail=[];expanded.clear();
    }
    render();
  });
  $('mapStartingPoint').onchange=()=>{start=$('mapStartingPoint').value;selected=start;selectedOnly=false;trail=[];expanded.clear();$('mapPathFilter').value=start;page=0;render();};
  $('mapReset').onclick=()=>{resetNavigation();render();};
  $('mapPrevious').onclick=()=>{page--;renderTable();};$('mapNext').onclick=()=>{page++;renderTable();};
  $('mapDownloadAll').onclick=()=>download(websiteMapCsv(report.pages),'text/csv;charset=utf-8','website-map-all.csv');
  $('mapDownloadFiltered').onclick=()=>download(websiteMapCsv(rows()),'text/csv;charset=utf-8','website-map-filtered.csv');
  $('mapDownloadJson').onclick=()=>download(JSON.stringify(report,null,2),'application/json','website-map.json');
  $('mapDownloadGraph').onclick=()=>{
    const svg=$('mapGraph').querySelector('svg').cloneNode(true);
    const style=document.createElementNS('http://www.w3.org/2000/svg','style');
    style.textContent='.map-flow{fill:#dfeadf;fill-opacity:.7}.map-node-bar{fill:#4d8b69}.map-node-more{fill:#b7cda1}text{font-family:Arial,sans-serif;fill:#214c3b;font-size:12px}.map-node-count{font-weight:bold;font-size:11px}.map-column-heading{font-size:11px;fill:#61746a}';
    svg.prepend(style);download(new XMLSerializer().serializeToString(svg),'image/svg+xml','website-map-path.svg');
  };
  return {
    render,
    connect(value){token=value;if(visible)void refresh();},
    show(value){visible=value;clearTimeout(timer);if(value){render();void refresh();}},
    load(value){if(active)throw Error(t('mapBusy'));report=validateWebsiteMap(value);imported=true;resetNavigation();render();}
  };
}
