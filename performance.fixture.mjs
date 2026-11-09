import http from 'node:http';
export async function fixture(){
 const hits={documents:{},publicAssets:0,privateAssets:0,analytics:0,mutations:0};
 const server=http.createServer((req,res)=>{
  const base=`http://127.0.0.1:${server.address().port}`;
  if(req.url==='/robots.txt'){res.end('User-agent: *');return;}
  if(req.url==='/sitemap.xml'){res.end('<urlset>'+['/','/a','/b'].map(p=>'<url><loc>'+base+p+'</loc></url>').join('')+'</urlset>');return;}
  if(req.url.startsWith('/g/collect')){hits.analytics++;res.end('should be held');return;}
  if(req.url==='/mutate'){hits.mutations++;res.end();return;}
  if(req.url==='/public.js'){hits.publicAssets++;res.setHeader('Cache-Control','public, max-age=300');res.setHeader('Content-Type','application/javascript');setTimeout(()=>res.end('window.fixturePublic=true;'),400);return;}
  if(req.url==='/private.js'){hits.privateAssets++;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/javascript');res.end('window.fixturePrivate=true;');return;}
  if(!['/','/a','/b'].includes(req.url)){res.statusCode=404;res.end();return;}
  hits.documents[req.url]=(hits.documents[req.url]||0)+1;
  res.setHeader('Content-Type','text/html');
  res.end(`<!doctype html><html><head><title>v1.4 validation</title><script src="/public.js"></script><script src="/private.js"></script><script>window.dataLayer=[];dataLayer.push({event:'gtm_pageview',page_location:location.href});</script></head><body><main><h1>${req.url}</h1>${req.url==='/'?['one','two','three'].map(id=>`<button id="${id}" type="button" onclick="dataLayer.push({event:'select_feature',feature:'${id}'});fetch('/g/collect?v=2&tid=G-FIXTURE&en=select_feature&ep.feature=${id}');fetch('/mutate',{method:'POST',body:'blocked'}).catch(()=>{})">Feature ${id}</button>`).join('')+'<a id="next" href="/a">Next</a><a hidden href="/b">B</a>':''}</main></body></html>`);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {url:`http://127.0.0.1:${server.address().port}/`,hits,close:()=>new Promise(resolve=>server.close(resolve))};
}
