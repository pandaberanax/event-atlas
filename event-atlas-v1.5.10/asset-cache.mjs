// Per-page-context memory cache. Never cache documents, API data, cookies or analytics responses.
export function staticAssetCache(metrics,{enabled=true,maxBytes=16*1024*1024}={}){
 const cache=new Map();let bytes=0;
 return async (route,fulfill=options=>route.fulfill(options))=>{
  const req=route.request();if(!enabled||req.method()!=='GET'||!['script','stylesheet','font','image'].includes(req.resourceType()))return false;
  const requestHeaders=await req.allHeaders();
  if(requestHeaders.authorization||/no-store|no-cache/i.test(requestHeaders['cache-control']||''))return false;
  // Include every request header so Vary cannot mix language, cookie or client-hint variants.
  const key=JSON.stringify([req.url(),Object.entries(requestHeaders).sort(([a],[b])=>a.localeCompare(b))]);
  const saved=cache.get(key);
  if(saved&&saved.expires>Date.now()){
   await fulfill({status:200,headers:saved.headers,body:saved.body});
   metrics.cacheHits++;
   metrics.cacheBytesSaved+=saved.body.length;
   return true;
  }
  if(saved){bytes-=saved.body.length;cache.delete(key);}
  let reply;
  try{
   const response=await route.fetch({maxRedirects:0,timeout:20000});metrics.assetFetches++;
   const headers=response.headers(),control=headers['cache-control']||'',vary=headers.vary||'';
   const age=control.match(/(?:^|,)\s*max-age=(\d+)/i);
   const freshness=age?Number(age[1])-Math.max(Number(headers.age)||0,(Date.now()-Date.parse(headers.date||new Date().toUTCString()))/1000):0;
   if(response.status()===200&&freshness>0&&!/no-store|no-cache|private/i.test(control)&&!headers['set-cookie']&&!/\*|cookie|authorization/i.test(vary)){
    const body=await response.body();
    const clean={...headers};delete clean['content-encoding'];delete clean['content-length'];delete clean['transfer-encoding'];
    if(body.length<=maxBytes){while(bytes+body.length>maxBytes&&cache.size){const first=cache.keys().next().value;bytes-=cache.get(first).body.length;cache.delete(first);}cache.set(key,{body,headers:clean,expires:Date.now()+Math.min(freshness,3600)*1000});bytes+=body.length;}
    reply={status:200,headers:clean,body};
   }else reply={response};
  }catch{return false;}
  // A fallback is safe only while preparing the response, before fulfilling the route.
  await fulfill(reply);
  return true;
 };
}
