export const PLATFORMS = [{id:'ga4',name:'GA4'},{id:'dataLayer',name:'dataLayer'},{id:'moengage',name:'MoEngage'},{id:'braze',name:'Braze'},{id:'mixpanel',name:'Mixpanel'}];
export const PLATFORM_IDS=PLATFORMS.map(p=>p.id);
export const platformName=id=>PLATFORMS.find(p=>p.id===id)?.name||id;
export const androidPlatformName=id=>id==='ga4'?'GA4 / Firebase':id==='gtm'?'Google Tag Manager':platformName(id);
export const eventPlatform=event=>event.platform||(event.source==='dataLayer'?'dataLayer':'ga4');
export function selectedPlatforms(value){
 if(value===undefined)return [...PLATFORM_IDS];
 if(!Array.isArray(value)||!value.length||value.some(v=>!PLATFORM_IDS.includes(v)))throw Error('Pilih minimal satu platform yang valid.');
 return [...new Set(value)];
}
export function uniqueEvents(events){return new Set(events.map(e=>eventPlatform(e)+'\u0000'+e.name)).size;}
