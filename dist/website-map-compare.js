import {t,locale} from './i18n.js';
import {validateWebsiteMap,compareWebsiteMaps,websiteComparisonCsv} from './website-map-model.js';

const $=id=>document.getElementById(id);
const SIZE=40;

export function createWebsiteMapComparison({current,readSaved,onIssue,download}) {
  let baseline;
  let page=0;
  let filtered=[];
  let generation=0;
  const choice=$('mapCompareSaved');

  function render(history=[]) {
    const value=choice.value;
    choice.replaceChildren(new Option(t('mapChooseScan'),''));
    for(const item of history)choice.add(new Option(item.root+' · '+new Date(item.startedAt).toLocaleString(locale()),item.id));
    choice.value=value;
    const report=current();
    $('mapCompareBaseline').textContent=baseline?baseline.root+' · '+new Date(baseline.startedAt).toLocaleString(locale()):t('mapCompareEmpty');
    $('mapCompareCurrent').textContent=report?report.root+' · '+new Date(report.startedAt).toLocaleString(locale()):'';
    const body=$('mapCompareRows');body.replaceChildren();
    $('mapCompareResults').hidden=!baseline||!report;
    $('mapCompareDownload').disabled=true;
    if(!baseline||!report)return;
    let comparison;
    try{comparison=compareWebsiteMaps(baseline,report);}catch(failure){$('mapCompareNotice').textContent=t(failure.message);return;}
    $('mapCompareNotice').textContent=[t('mapCompareMeaning'),comparison.sameScope?'':t('mapCompareScopeWarning'),comparison.partial?t('mapComparePartial'):''].filter(Boolean).join(' ');
    $('mapCompareCounts').replaceChildren();
    for(const [type,total] of Object.entries(comparison.totals)){
      const button=document.createElement('button');button.type='button';button.className='map-compare-count';
      button.textContent=t('mapChange_'+type)+' · '+total.toLocaleString(locale());
      button.onclick=()=>{$('mapCompareFilter').value=type;page=0;render(history);};
      $('mapCompareCounts').append(button);
    }
    const filter=$('mapCompareFilter').value;
    filtered=comparison.rows.filter(row=>filter==='all'?row.changes[0]!=='unchanged':row.changes.includes(filter));
    const pages=Math.max(1,Math.ceil(filtered.length/SIZE));page=Math.min(page,pages-1);
    for(const entry of filtered.slice(page*SIZE,(page+1)*SIZE)){
      const row=document.createElement('tr');
      const link=document.createElement('a');link.href=entry.url;link.target='_blank';link.rel='noreferrer';link.textContent=entry.url;
      row.insertCell().append(link);
      row.insertCell().textContent=entry.changes.map(type=>t('mapChange_'+type)).join(' · ');
      for(const item of [entry.before,entry.after]){
        const status=row.insertCell();status.textContent=item?t('mapStatus_'+item.status):t('mapCompareAbsent');
        const http=document.createElement('small');http.textContent=item?'HTTP '+(item.httpStatus||'—'):'';status.append(http);
      }
      for(const item of [entry.before,entry.after])row.insertCell().textContent=item?.finalUrl||'—';
      body.append(row);
    }
    $('mapCompareEmptyRows').hidden=filtered.length>0;
    $('mapCompareCount').textContent=t('mapCompareCount',{n:filtered.length.toLocaleString(locale())});
    $('mapComparePage').textContent=(page+1)+' / '+pages;
    $('mapComparePrevious').disabled=page===0;$('mapCompareNext').disabled=page>=pages-1;
    $('mapCompareDownload').disabled=!filtered.length;
  }
  let history=[];
  $('mapCompareImport').onclick=()=>$('mapCompareFile').click();
  $('mapCompareFile').onchange=async event=>{
    const request=++generation;
    try{
      const file=event.target.files[0];if(!file)return;
      if(file.size>64*1024*1024)throw Error('mapInvalidReport');
      const value=validateWebsiteMap(JSON.parse(await file.text()));
      if(request!==generation)return;
      baseline=value;choice.value='';page=0;render(history);
    }catch(failure){onIssue(failure.message==='mapInvalidReport'?failure.message:'mapInvalidReport');}
    finally{event.target.value='';}
  };
  choice.onchange=async()=>{
    const request=++generation;
    if(!choice.value){baseline=undefined;render(history);return;}
    try{
      const report=await readSaved(choice.value);
      if(request!==generation)return;
      baseline=validateWebsiteMap(report);page=0;render(history);
    }catch(failure){onIssue(failure.message);}
  };
  $('mapCompareFilter').onchange=()=>{page=0;render(history);};
  $('mapComparePrevious').onclick=()=>{page--;render(history);};$('mapCompareNext').onclick=()=>{page++;render(history);};
  $('mapCompareDownload').onclick=()=>download(websiteComparisonCsv(filtered),'text/csv;charset=utf-8','website-map-comparison.csv');
  return {render(items){history=items;render(history);}};
}
