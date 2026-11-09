export function parseCollect(url, body = '') {
  try {
    const u = new URL(url);
    const common = new URLSearchParams(u.search);
    return (body ? body.split(/\r?\n/) : ['']).flatMap(line => {
      const p = new URLSearchParams(common);
      for (const [k, v] of new URLSearchParams(line)) p.set(k, v);
      if (p.get('v') !== '2' || !p.get('en') || !p.get('tid')?.startsWith('G-')) return [];
      const parameters = {};
      for (const [k, v] of p) if (/^(ep\.|epn\.)/.test(k)) parameters[k.replace(/^epn?\./, '')] = v;
      return [{ name: p.get('en'), measurementId: p.get('tid'), parameters, reportedPage: p.get('dl') || '', endpoint: u.origin + u.pathname }];
    });
  } catch { return []; }
}

const hostIs=(host,domain)=>host===domain||host.endsWith('.'+domain);
function json(value){try{return JSON.parse(value);}catch{return null;}}
function decodeBase64(value) {
  const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(decoded, char => char.charCodeAt(0)));
}

// Match vendor hosts and documented SDK payloads; a generic 'event' key alone is not vendor evidence.
export function parseVendorPayload(url,text='',headers={}){
 try{
  const u=new URL(url),host=u.hostname,endpoint=u.origin+u.pathname;
  const data=json(text),out=[];
  if(hostIs(host,'mixpanel.com')&&/\/track\/?$/.test(u.pathname)){
   const encoded=new URLSearchParams(text).get('data')||u.searchParams.get('data');
   let payload=data;
   if(!payload&&encoded)payload=json(encoded)||json(decodeBase64(encoded));
   const events=Array.isArray(payload)?payload:payload?[payload]:[];
   for(const e of events)if(typeof e?.event==='string'&&e.properties&&typeof e.properties==='object'){
    const {token,...parameters}=e.properties;
    out.push({platform:'mixpanel',name:e.event,parameters,endpoint,reportedPage:parameters.$current_url||'',eventTime:parameters.time||null,batch:events.length>1});
   }
  }
  if((hostIs(host,'braze.com')||hostIs(host,'appboy.com')||headers['x-braze-api-key'])&&/\/api\/v3\/data\/?$/.test(u.pathname)&&Array.isArray(data?.events)){
   for(const e of data.events){
    if(e.name==='ce'&&typeof e.data?.n==='string')out.push({platform:'braze',name:e.data.n,parameters:e.data.p||{},endpoint,eventTime:e.time||null,batch:true});
    else if(e.name==='p'&&e.data&&typeof e.data.pid==='string')out.push({platform:'braze',name:'purchase',parameters:{product_id:e.data.pid,currency:e.data.c,price:e.data.p,quantity:e.data.q,properties:e.data.pr},endpoint,eventTime:e.time||null,batch:true});
   }
  }
  if(hostIs(host,'moengage.com')&&data){
   const events=Array.isArray(data.viewsInfo)?data.viewsInfo:[data];
   for(const e of events){
    if(typeof e.EVENT_ACTION==='string')out.push({platform:'moengage',name:e.EVENT_ACTION,parameters:e.EVENT_ATTRS||{},endpoint,reportedPage:e.EVENT_ATTRS?.URL||'',eventTime:e.EVENT_G_TIME||null,batch:true});
    else if(typeof e.e==='string'&&e.a&&typeof e.a==='object')out.push({platform:'moengage',name:e.e,parameters:e.a,endpoint,reportedPage:e.url||e.a.URL||'',batch:false});
   }
  }
  return out;
 }catch{return [];}
}
