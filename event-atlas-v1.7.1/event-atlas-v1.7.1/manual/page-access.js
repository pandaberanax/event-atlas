// Pure, shared by the browser capture and both local engines. Do not treat a
// CAPTCHA widget on an otherwise normal form as an interstitial challenge.
export function detectAccessIssue({html='',title='',url='',status=0}={}){
  const name=String(title).replace(/&nbsp;/gi,' ').trim();
  const markup=String(html);
  if(/triggerInterstitialChallenge|\/_sec\/verify\?provider=interstitial/i.test(markup))return 'pageVerificationRequired';
  if(/id\s*=\s*["']challenge-form/i.test(markup)&&/cf-chl-|challenge-platform/i.test(markup))return 'pageVerificationRequired';
  if(/\/cdn-cgi\/challenge-platform\//i.test(markup)&&/just a moment|checking your browser|verify (?:you are|that you are)/i.test(name))return 'pageVerificationRequired';
  if(/(?:id\s*=\s*["']px-captcha|captcha-delivery\.com\/captcha\/|<iframe[^>]+\/_Incapsula_Resource)/i.test(markup))return 'pageVerificationRequired';
  if(/^(?:just a moment\.?\.?\.?|verify (?:you are|that you are) human|checking your browser|pardon our interruption|attention required[!\s|—-]*(?:cloudflare)?)$/i.test(name))return 'pageVerificationRequired';
  if(/^(?:access denied|request (?:blocked|rejected)|403 forbidden|forbidden|error 403)[.!\s]*$/i.test(name)&&
    (status===403||/access denied|request (?:blocked|rejected)|permission to access/i.test(markup)))return 'pageAccessDenied';
  return null;
}

export function captureMapPage(detect){
  if(!/^https?:$/.test(location.protocol))return null;
  const html=document.documentElement?.outerHTML||'';
  const accessIssue=detect({html,title:document.title,url:location.href});
  const anchors=[...document.querySelectorAll('a[href],area[href]')];
  const links=[...new Set(anchors.map(a=>a.href).filter(value=>{
    try{const u=new URL(value);return /^https?:$/.test(u.protocol)&&u.origin===location.origin&&!u.username&&!u.password;}catch{return false;}
  }))];
  return {page:location.href,title:document.title.slice(0,2000),links:links.slice(0,10000),
    time:Date.now(),accessIssue,truncated:links.length>10000};
}
