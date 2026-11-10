import {gunzipSync} from 'node:zlib';
import {detectAccessIssue} from './manual/page-access.js';
const MAX_BYTES=8*1024*1024;
export function sitemapText(buffer){
  const bytes=buffer[0]===0x1f&&buffer[1]===0x8b?gunzipSync(buffer,{maxOutputLength:MAX_BYTES}):buffer;
  if(bytes.length>MAX_BYTES)throw Error('mapSitemapLarge');return bytes.toString('utf8');
}
export function sitemapLocations(xml){
  const issue=detectAccessIssue({html:xml,title:xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]});if(issue)throw Error(issue);
  if(!/<(?:\w+:)?(?:urlset|sitemapindex)\b/i.test(xml))throw Error('mapInvalidSitemapContent');
  return [...xml.matchAll(/<(?:\w+:)?loc(?:\s[^>]*)?>\s*([\s\S]*?)\s*<\/(?:\w+:)?loc>/gi)].map(match=>match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,code)=>{const point=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return point>0&&point<=0x10ffff?String.fromCodePoint(point):'';})
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&'));
}

export async function discoverSitemaps({seeds,origin,maxSitemaps=500,concurrency=3,prefix='/',maxPages,report,fetchText,add,signal,publish}){
  const queue=[],queued=new Set(),seen=new Set();let omitted=0,failed=0;
  const scopeTokens=prefix.split('/').filter(Boolean).map(s=>s.toLowerCase());
  function enqueue(value){
    let url;try{url=new URL(value,origin);}catch{return;}
    if(url.origin!==origin||url.username||url.password||queued.has(url.href)||!/^https?:$/.test(url.protocol))return;
    if(queued.size>=maxSitemaps*20){omitted++;return;}
    queued.add(url.href);queue.push(url.href);
  }
  function update(){report.discovery={sitemapsFound:queued.size+omitted,sitemapsRead:report.sitemaps.length,sitemapsAttempted:seen.size,
    sitemapsFailed:failed,sitemapsPending:queue.length+omitted+workers.size,sitemapLimit:maxSitemaps,partial:queue.length+omitted>0||failed>0&&!report.sitemaps.length};}
  for(const seed of seeds)enqueue(seed);
  const workers=new Set();
  while((queue.length||workers.size)&&!signal?.aborted){
    queue.sort((a,b)=>scopeTokens.filter(s=>b.toLowerCase().includes(s)).length-scopeTokens.filter(s=>a.toLowerCase().includes(s)).length);
    while(queue.length&&workers.size<concurrency&&seen.size<maxSitemaps&&report.pages.length<maxPages){
      const url=queue.shift();if(seen.has(url))continue;seen.add(url);
      const job=(async()=>{
        try{const xml=await fetchText(url),locs=sitemapLocations(xml);
          report.sitemaps.push({url,urls:locs.length});
          if(/<(?:\w+:)?sitemapindex\b/i.test(xml))for(const loc of locs)enqueue(loc);
          else for(const loc of locs)add(loc,'sitemap',url);
        }catch(failure){failed++;if(report.warnings.length<100)report.warnings.push({url,error:failure.message.slice(0,4000)});}
      })().finally(()=>{workers.delete(job);update();publish();});workers.add(job);
    }
    if(workers.size)await Promise.race(workers);else break;
  }
  await Promise.allSettled(workers);update();
  if(queue.length+omitted>0)report.warnings.push({error:report.pages.length>=maxPages?'mapSitemapsPageLimit':'mapSitemapLimit'});
  return !report.discovery.partial&&!signal?.aborted;
}
