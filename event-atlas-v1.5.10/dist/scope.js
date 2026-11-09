export function auditScope(value='site'){
 if(!['site','single'].includes(value))throw Error('Pilih cakupan audit yang valid.');
 return value;
}
export function pageKey(value,base,hashRouting=false){
 try{const u=new URL(value,base);if(!['http:','https:'].includes(u.protocol))return null;if(!hashRouting)u.hash='';u.searchParams.sort();return u.href;}catch{return null;}
}
