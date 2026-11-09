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
    && (status === 'all' || row.status === status));
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
