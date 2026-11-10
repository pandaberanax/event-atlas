import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {scanWebsiteMap,websiteMapOptions} from '../website-map.mjs';
import {mapUrl,buildWebsiteTree,websiteMapRows,websiteMapCsv,validateWebsiteMap} from '../dist/website-map-model.js';

test('Website Map preserves hierarchy, sibling boundaries, query choices and CSV values',()=>{
  const root='https://example.com/';
  assert.equal(mapUrl('/products?x=1&utm_source=test#section',root),'https://example.com/products');
  assert.equal(mapUrl('/products?b=2&a=1&utm_source=test',root,true),'https://example.com/products?a=1&b=2');
  assert.equal(mapUrl('javascript:alert(1)',root),null);
  assert.equal(mapUrl('/file.pdf',root),null);
  const pages=['/','/products','/products/a','/products/b','/products-extra/a','/a%2Fb/item'].map(path=>({url:root.slice(0,-1)+path,title:'Page',status:'ok'}));
  const tree=buildWebsiteTree([...pages,pages[1]],root);
  assert.equal(tree.get('/').count,6);
  assert.equal(tree.get('/products').count,3);
  assert.equal(tree.get('/products').own.length,1);
  assert.equal(tree.get('/a%2Fb').label,'a/b');
  assert.deepEqual(websiteMapRows({pages},{prefix:'/products'}).map(row=>new URL(row.url).pathname),['/products','/products/a','/products/b']);
  assert.equal(websiteMapRows({pages},{depth:'1'}).length,2);
  const report={schemaVersion:1,mode:'website-map',root,pages};
  assert.equal(validateWebsiteMap(report),report);
  assert.throws(()=>validateWebsiteMap({...report,pages:[...pages,{url:'https://another.example/',title:'x',status:'ok'}]}),/mapInvalidReport/);
  assert.match(websiteMapCsv([{...pages[0],title:'=FORMULA,"quoted"'}]),/"'=FORMULA,""quoted"""/);
  assert.throws(()=>websiteMapOptions({url:'file:///test'}),/mapInvalidUrl/);
});

test('Website Map discovers nested sitemaps and JS links, honors robots, keeps limits and partial results', {timeout:60000},async()=>{
  const hits=[];
  let origin;
  const server=http.createServer((req,res)=>{
    hits.push(req.url);
    if(req.url==='/robots.txt'){res.end('User-agent: *\nDisallow: /private\nAllow: /private/public$\nSitemap: '+origin+'/index.xml');return;}
    if(req.url==='/sitemap.xml'){res.statusCode=404;res.end();return;}
    if(req.url==='/index.xml'){res.end('<sitemapindex><sitemap><loc>'+origin+'/pages.xml</loc></sitemap></sitemapindex>');return;}
    if(req.url==='/pages.xml'){res.end('<urlset>'+['/products/a','/private/secret','/private/public','/missing'].map(path=>'<url><loc>'+origin+path+'</loc></url>').join('')+'</urlset>');return;}
    if(req.url==='/missing'){res.statusCode=404;res.end('<title>Missing</title>');return;}
    res.setHeader('Content-Type','text/html');
    res.end('<title>'+req.url+'</title>'+(req.url==='/'?'<a href="/products">Products</a><a href="/products?utm_source=test">Duplicate</a><a href="https://outside.example/">Outside</a><a href="/logout">Logout</a><script>const a=document.createElement("a");a.href="/js-page";a.textContent="JS";document.body.append(a)</script>':''));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  origin='http://127.0.0.1:'+server.address().port;
  try{
    const report=await scanWebsiteMap({url:origin,maxPages:30,rendered:true});
    assert.equal(report.status,'completed',JSON.stringify(report));
    assert.ok(report.pages.some(row=>row.url===origin+'/js-page'));
    assert.equal(report.pages.find(row=>row.url===origin+'/private/secret').status,'skipped');
    assert.equal(report.pages.find(row=>row.url===origin+'/private/public').status,'ok');
    assert.equal(report.pages.find(row=>row.url===origin+'/missing').httpStatus,404);
    assert.equal(report.pages.find(row=>row.url===origin+'/logout').status,'skipped');
    assert.ok(!hits.includes('/private/secret') && !hits.includes('/logout'));
    assert.equal(report.pages.filter(row=>row.url===origin+'/products').length,1);
    assert.equal(report.sitemaps.length,2);
    assert.equal(validateWebsiteMap(report),report);
    assert.ok(report.durationMs>0 && report.finishedAt);
    const limited=await scanWebsiteMap({url:origin,maxPages:2});
    assert.equal(limited.pages.length,2);
    assert.equal(limited.pages[0].url,origin+'/');
    assert.equal(limited.status,'limited');
    const stop=new AbortController();
    const partial=await scanWebsiteMap({url:origin},value=>{if(value.pages.some(row=>row.status==='ok'))stop.abort();},stop.signal);
    assert.equal(partial.status,'stopped');
    assert.ok(partial.pages.some(row=>row.url===origin+'/'));
    assert.ok(partial.pages.every(row=>row.status!=='loading'));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
