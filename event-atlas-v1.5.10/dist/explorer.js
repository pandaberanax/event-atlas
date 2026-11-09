import {t,locale} from './i18n.js';
import {eventPlatform,platformName} from './platforms.js';
import {eventInfo,groupEvents} from './event-model.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString(locale());
const path=url=>{try{const u=new URL(url);return u.pathname+u.search;}catch{return url;}};
export const groupKey=e=>JSON.stringify([eventPlatform(e),e.name,eventInfo(e).category]);
export function filteredEvents(state){return(state.report?.events||[]).filter(e=>{
 const info=eventInfo(e),element=info.contextElement;
 return(state.source==='all'||e.source===state.source||state.source==='sdk'&&e.source==='gtag')&&
 (state.resultPlatform==='all'||eventPlatform(e)===state.resultPlatform)&&
 (!state.groupFilter||groupKey(e)===state.groupFilter)&&
 (state.category==='all'||state.category==='navigation'&&info.attribution==='navigation'||info.category===state.category)&&
 [e.name,e.page,info.origin,info.observed,element?.text,element?.selector,e.measurementId,platformName(eventPlatform(e))].some(v=>String(v||'').toLowerCase().includes(state.search.toLowerCase()));
 });}
export const relationshipName=e=>t('relationship_'+eventInfo(e).attribution);
export function renderExplorer(state,sourceName){
 const observations=filteredEvents(state),grouped=state.eventView==='groups',rows=grouped?groupEvents(observations):observations;
 const pages=Math.max(1,Math.ceil(rows.length/20));state.page=Math.min(state.page,pages-1);
 $('eventCount').textContent=t(grouped?'groupsCount':'rawCount',{n:fmt(rows.length),observations:fmt(observations.length)});
 $('navCount').textContent=fmt(state.report?.events?.length);$('clearGroup').hidden=!state.groupFilter;
 document.querySelector('.events-table').classList.toggle('grouped-events',grouped);
 const headers=grouped?['colEvent','colPlatform','category','colPages','testLocations','colEvidence','']:['colEvent','originEventPage','colElement','testAction','colPlatform','colEvidence',''];
 $('eventHeaders').innerHTML=headers.map(key=>'<th>'+esc(key?t(key):'')+'</th>').join('');
 $('eventsBody').innerHTML=rows.slice(state.page*20,state.page*20+20).map(row=>{
  if(grouped){const g=row;return `<tr class="event-row" tabindex="0" aria-label="${esc(g.name+' · '+platformName(g.platform)+' · '+t('viewDetails'))}" data-group="${esc(encodeURIComponent(g.key))}"><td><span class="event-name">${esc(g.name)}</span><span class="table-sub">${esc(t('rawCount',{n:fmt(g.events.length)}))}</span></td><td>${esc(platformName(g.platform))}</td><td>${esc(t('category_'+g.category))}</td><td>${fmt(g.pages.size)}</td><td>${fmt(g.elements.size)}</td><td>${[...g.sources].map(s=>'<span class="source '+esc(s)+'">'+esc(sourceName(s))+'</span>').join(' ')}</td><td class="row-arrow">↗</td></tr>`;}
  const e=row,info=eventInfo(e),el=info.contextElement,contextOnly=info.category==='page'||info.attribution==='navigation'||info.attribution==='batch';
  return `<tr class="event-row" tabindex="0" data-event="${esc(e.id)}" aria-label="${esc(t('observation')+' '+e.name)}"><td><span class="event-name">${esc(e.name)}</span><span class="table-sub">${esc(t('category_'+info.category))}${info.legacy?' · '+esc(t('legacyEvidence')):''}</span></td><td><span class="page-url" title="${esc(info.origin)}">${esc(path(info.origin))}</span>${info.navigated?'<span class="destination" title="'+esc(info.observed)+'">→ '+esc(path(info.observed))+'</span>':''}</td><td><span class="element-text">${esc(contextOnly?t('page'):el?.text||t('page'))}</span><span class="table-sub" title="${esc(el?.selector||'')}">${esc(el?(contextOnly?t('previousAction')+': '+el.text:el.region+' · '+el.tag):t('pageLevel'))}</span></td><td><span class="trigger">${esc(t(e.trigger||e.action))}</span><span class="table-sub relationship">${esc(relationshipName(e))}</span></td><td><span class="platform-badge ${esc(eventPlatform(e))}">${esc(platformName(eventPlatform(e)))}</span></td><td><span class="source ${esc(e.source)}">${esc(sourceName(e.source))}</span></td><td class="row-arrow">↗</td></tr>`;
 }).join('');
 $('eventsEmpty').hidden=rows.length>0;$('eventsEmpty').querySelector('h3').textContent=t(!state.report?'emptyTitle':state.search||state.source!=='all'?'noMatch':'noEvents');$('eventsEmpty').querySelector('p').textContent=t(state.report?'checkCoverage':'emptyBody');
 $('tableCount').textContent=t(grouped?'groupsCount':'rawCount',{n:fmt(rows.length),observations:fmt(observations.length)});$('pageNumber').textContent=`${state.page+1} / ${pages}`;$('prev').disabled=state.page===0;$('next').disabled=state.page>=pages-1;
}
