import {gunzipSync,inflateSync} from 'node:zlib';
import {parseVendorPayload} from './manual/network-events.js';
const hostIs=(host,domain)=>host===domain||host.endsWith('.'+domain);
function json(value){try{return JSON.parse(value);}catch{return null;}}
function decodeBody(body,headers){
 if(!body)return '';
 if(Buffer.isBuffer(body)){
  try{if(headers['content-encoding']==='gzip'||body[0]===31&&body[1]===139)return gunzipSync(body,{maxOutputLength:4000000}).toString();if(headers['content-encoding']==='deflate')return inflateSync(body,{maxOutputLength:4000000}).toString();}catch{return '';}
  return body.toString('utf8');
 }
 return String(body);
}
export function parseVendorEvents(url,body='',headers={}) {
 return parseVendorPayload(url,decodeBody(body,headers),headers);
}
export function recognizedEventEndpoint(url){
 try{const u=new URL(url);if(hostIs(u.hostname,'mixpanel.com')&&/\/track\/?$/.test(u.pathname))return 'mixpanel';if((hostIs(u.hostname,'braze.com')||hostIs(u.hostname,'appboy.com'))&&/\/api\/v3\/data\/?$/.test(u.pathname))return 'braze';if(hostIs(u.hostname,'moengage.com')&&/report|event|\/track(?:\/|$)/i.test(u.pathname)&&!/logging|metrics/i.test(u.pathname))return 'moengage';}catch{}
 return null;
}
export function knownEmptyPayload(url,body,headers={}){
 try{const platform=recognizedEventEndpoint(url),data=json(decodeBody(body,headers));
  if(platform==='braze')return !!data&&typeof data==='object'&&(data.api_key||data.device_id||data.sdk_version)&&(!data.events||Array.isArray(data.events)&&data.events.length===0);
  if(platform==='moengage')return !!data&&Array.isArray(data.viewsInfo)&&data.viewsInfo.length===0;
  if(platform==='mixpanel')return Array.isArray(data)&&data.length===0;
 }catch{}
 return false;
}
