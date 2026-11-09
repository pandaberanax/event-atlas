// Serialized into each document before its scripts. Observe SDK calls, preserve this/return/errors,
// and leave absent SDK globals undefined so the site's loader can initialize normally.
export function instrumentVendors({platforms}){
 const enabled=new Set(platforms),globals=new Set(),objects=new WeakMap(),wrappers=new WeakSet(),depth={};
 const clean=value=>{try{return JSON.parse(JSON.stringify(value??{}));}catch{return {};}};
 const send=data=>{try{window.__atlasRecord({...data,interaction:window.__atlasInteraction?.()||null,frameUrl:location.href,time:Date.now()}).catch(()=>{});}catch{}};
 function watchObject(object,platform,instance=''){
  if(!object||!['object','function'].includes(typeof object))return;
  const seen=objects.get(object)||new Set();objects.set(object,seen);
  const methods=platform==='moengage'?['trackEvent','track_event']:platform==='braze'?['logCustomEvent','logPurchase']:['track','init'];
  for(const method of methods){
   if(seen.has(method))continue;seen.add(method);
   const descriptor=Object.getOwnPropertyDescriptor(object,method);
   if(descriptor&&!descriptor.configurable)continue;
   let original=object[method];
   const wrap=fn=>{
    if(typeof fn!=='function'||wrappers.has(fn))return fn;
    const wrapped=function(...args){
     if(!depth[platform]&&method!=='init'&&typeof args[0]==='string'){
      let name=args[0],parameters=clean(args[1]);
      if(method==='logPurchase'){name='purchase';parameters={product_id:args[0],price:args[1],currency:args[2],quantity:args[3],properties:clean(args[4])};}
      send({platform,source:'sdk',name,parameters,apiMethod:method,sdkInstance:instance});
     }
     depth[platform]=(depth[platform]||0)+1;
     try{
      const result=Reflect.apply(fn,this,args);
      if(method==='init'){
       if(result&&typeof result==='object')watchObject(result,platform,typeof args[2]==='string'?args[2]:instance);
       scanInstances(object,platform);
      }
      return result;
     }finally{depth[platform]--;}
    };wrappers.add(wrapped);return wrapped;
   };
   original=wrap(original);
   try{Object.defineProperty(object,method,{configurable:true,enumerable:descriptor?.enumerable??true,get:()=>original,set(fn){original=wrap(fn);}});}catch{}
  }
  if(methods.some(name=>typeof object[name]==='function'))send({source:'config',platform,name:platform});
 }
 function scanInstances(object,platform){
  if(platform!=='mixpanel'||!object)return;
  for(const [name,value]of Object.entries(object))if(value&&typeof value==='object'&&typeof value.track==='function')watchObject(value,platform,name);
 }
 function watchGlobal(name,platform){
  if(globals.has(name))return;globals.add(name);
  const descriptor=Object.getOwnPropertyDescriptor(window,name);
  if(descriptor&&!descriptor.configurable){watchObject(window[name],platform,name);return;}
  let value=window[name];watchObject(value,platform,name);
  try{Object.defineProperty(window,name,{configurable:true,enumerable:descriptor?.enumerable??true,get:()=>value,set(next){value=next;watchObject(value,platform,name);scanInstances(value,platform);}});}catch{}
 }
 if(enabled.has('moengage')){
  for(const name of ['Moengage','moengage'])watchGlobal(name,'moengage');
  window.addEventListener('MOE_AUTOMATED_EVENTS',event=>{const e=event.detail;if(typeof e?.name==='string')send({platform:'moengage',source:'sdk',name:e.name,parameters:clean(e.data),apiMethod:'MOE_AUTOMATED_EVENTS'});});
 }
 if(enabled.has('braze'))for(const name of ['braze','appboy'])watchGlobal(name,'braze');
 if(enabled.has('mixpanel'))watchGlobal('mixpanel','mixpanel');
 const scan=()=>{
  if(enabled.has('moengage')&&typeof window.moengage_object==='string')watchGlobal(window.moengage_object,'moengage');
  for(const name of globals){const platform=['braze','appboy'].includes(name)?'braze':name==='mixpanel'?'mixpanel':'moengage';watchObject(window[name],platform,name);scanInstances(window[name],platform);}
 };
 // Revisit named instances and objects replaced by an SDK loader; never initialize or flush an SDK.
 setInterval(scan,250);
}
