export function instrumentActivity(){
 window.__atlasInteraction=()=>{
  const e=window.event;if(e?.type!=='click'||!e.isTrusted||!(e.target instanceof Element))return null;
  const el=e.target.closest('a,button,[role="button"],input')||e.target;
  return {type:'click',selector:window.__atlasDescribe?.(el)?.selector||'',trusted:true};
 };
}
export async function pageSignature(page){
 return page.evaluate(()=>{
  let storage='';try{storage=JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage),document.cookie]);}catch{}
  const text=document.body?.innerHTML||'';let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return JSON.stringify([location.href,hash,text.length,storage,[...document.querySelectorAll('input,select,textarea')].map(e=>[e.value,e.checked])]);
 });
}
