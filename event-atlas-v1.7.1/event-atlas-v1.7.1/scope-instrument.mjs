// Keep eligible click handlers observable while holding navigation outside the audited URL.
export function instrumentSinglePage(){
 const state={locked:false,url:location.href};window.__atlasSingleScope=state;
 const key=value=>{try{const u=new URL(value,location.href);if(!/^#!?\//.test(new URL(state.url).hash))u.hash='';u.searchParams.sort();return u.href;}catch{return null;}};
 const allowed=value=>key(value)===key(state.url);
 const held=(url,method)=>{try{window.__atlasRecord({source:'navigation',targetUrl:new URL(url,location.href).href,apiMethod:method}).catch(()=>{});}catch{}};
 document.addEventListener('click',event=>{
  const link=event.target instanceof Element?event.target.closest('a[href]'):null;
  if(state.locked&&link&&(!allowed(link.href)||link.target==='_blank')){event.preventDefault();held(link.href,'link');}
 },true);
 for(const method of ['pushState','replaceState']){
  const original=history[method];history[method]=function(...args){
   if(state.locked&&args[2]!=null&&!allowed(args[2])){held(args[2],'history.'+method);return;}
   return Reflect.apply(original,this,args);
  };
 }
 const originalOpen=window.open;window.open=function(url,...args){
  if(state.locked){held(url||location.href,'window.open');return null;}
  return Reflect.apply(originalOpen,this,[url,...args]);
 };
 window.addEventListener('hashchange',()=>{
  if(state.locked&&!allowed(location.href)){held(location.href,'hashchange');history.replaceState(history.state,'',state.url);}
 });
}
