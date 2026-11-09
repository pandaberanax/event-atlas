const files = /\.(?:pdf|zip|gz|jpe?g|png|webp|gif|svg|ico|mp[34]|xlsx?|docx?|pptx?|woff2?|ttf|css|js|json|xml|txt)$/i;

export function mapUrl(value, base, keepQuery = false) {
  try {
    const url = new URL(value,base);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || files.test(url.pathname)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (!keepQuery || /^(?:utm_|gclid$|fbclid$|_ga$|_gl$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}

export const pathSegments = value => new URL(value).pathname.split('/').filter(Boolean);
export const pathDepth = value => pathSegments(value).length;
export function pathWithin(value, prefix) {
  return !prefix || prefix === '/' || value === prefix || value.startsWith(prefix.replace(/\/$/,'') + '/');
}
export function segmentLabel(value) {
  try {return decodeURIComponent(value);} catch {return value;}
}

export function buildWebsiteTree(rows, root) {
  const origin = new URL(root).origin;
  const tree = new Map([['/',{id:'/',label:new URL(root).host,depth:0,count:0,own:[],children:[]}]]);
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.url)) continue;
    const url = new URL(row.url);
    if (url.origin !== origin) continue;
    seen.add(row.url);
    let parent = tree.get('/');
    parent.count++;
    const segments = pathSegments(row.url);
    for (let i=0;i<segments.length;i++) {
      const id = '/' + segments.slice(0,i+1).join('/');
      if (!tree.has(id)) {
        tree.set(id,{id,label:segmentLabel(segments[i]),depth:i+1,count:0,own:[],children:[]});
        parent.children.push(id);
      }
      parent = tree.get(id);
      parent.count++;
    }
    parent.own.push(row);
  }
  for (const node of tree.values()) node.children.sort((a,b) => tree.get(b).count-tree.get(a).count || a.localeCompare(b));
  return tree;
}

export function websiteMapRows(report, {prefix='/',query='',depth='',status='all'} = {}) {
  const text = query.trim().toLowerCase();
  return (report?.pages || []).filter(row => pathWithin(new URL(row.url).pathname,prefix)
    && (!text || [row.url,row.title].join(' ').toLowerCase().includes(text))
    && (depth === '' || pathDepth(row.url) <= Number(depth))
    && (status === 'all' || status === 'pending' && ['discovered','loading'].includes(row.status) ||
      status === 'inspected' && ['ok','redirect','error'].includes(row.status) || row.status === status));
}

export function validateWebsiteMap(report) {
  if (report?.schemaVersion !== 1 || report.mode !== 'website-map' || !mapUrl(report.root) ||
    !Array.isArray(report.pages) || report.pages.length > 10000) throw Error('mapInvalidReport');
  const origin = new URL(report.root).origin;
  const statuses = ['discovered','loading','ok','redirect','error','skipped'];
  const seen = new Set();
  for (const row of report.pages) {
    if (typeof row?.url !== 'string' || mapUrl(row.url,undefined,true) !== row.url || new URL(row.url).origin !== origin ||
      seen.has(row.url) || !statuses.includes(row.status) || typeof row.title !== 'string' ||
      row.title.length > 2000 || row.error && (typeof row.error !== 'string' || row.error.length > 4000)) throw Error('mapInvalidReport');
    seen.add(row.url);
  }
  return report;
}

export function websiteMapCsv(rows) {
  const quote = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/,'\'$&').replaceAll('"','""') + '"';
  const records = [['url','title','path','subfolder','depth','status','http_status','source','found_on','final_url','notes'],
    ...rows.map(row => {const url = new URL(row.url);return [row.url,row.title,url.pathname,
      pathSegments(row.url).slice(0,-1).join('/'),pathDepth(row.url),row.status,row.httpStatus,row.source,row.foundOn,row.finalUrl,row.error];})];
  return '\uFEFF' + records.map(record => record.map(quote).join(',')).join('\r\n');
}

export function compareWebsiteMaps(before,after) {
  validateWebsiteMap(before);validateWebsiteMap(after);
  if(new URL(before.root).origin!==new URL(after.root).origin)throw Error('mapCompareOrigin');
  const previous=new Map(before.pages.map(row=>[row.url,row]));
  const current=new Map(after.pages.map(row=>[row.url,row]));
  const pending=row=>!row || ['discovered','loading'].includes(row.status);
  const rows=[];
  const totals={added:0,notFound:0,status:0,redirect:0,unchanged:0};
  for(const url of new Set([...previous.keys(),...current.keys()])){
    const left=previous.get(url),right=current.get(url),changes=[];
    if(!left)changes.push('added');
    else if(!right)changes.push('notFound');
    else if(!pending(left)&&!pending(right)){
      if(left.status!==right.status || left.httpStatus!==right.httpStatus)changes.push('status');
      if((left.finalUrl||url)!==(right.finalUrl||url))changes.push('redirect');
    }
    if(!changes.length)changes.push('unchanged');
    for(const change of changes)totals[change]++;
    rows.push({url,before:left,after:right,changes});
  }
  const scope=report=>JSON.stringify({origin:new URL(report.root).origin,scope:report.options?.scope||'site',
    includePath:report.options?.includePath||'/',excludePaths:report.options?.excludePaths||[],
    maxScanDepth:report.options?.maxScanDepth??null,keepQuery:report.options?.keepQuery===true,
    method:report.options?.method||(report.options?.rendered?'javascript':'links'),maxPages:report.options?.maxPages});
  return {rows,totals,sameScope:scope(before)===scope(after),partial:[before,after].some(report=>report.status!=='completed')};
}

export function websiteComparisonCsv(rows) {
  const quote=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  const records=[['url','changes','previous_status','current_status','previous_http','current_http','previous_final_url','current_final_url'],
    ...rows.map(row=>[row.url,row.changes.join(' | '),row.before?.status,row.after?.status,row.before?.httpStatus,
      row.after?.httpStatus,row.before?.finalUrl,row.after?.finalUrl])];
  return '\uFEFF'+records.map(record=>record.map(quote).join(',')).join('\r\n');
}
