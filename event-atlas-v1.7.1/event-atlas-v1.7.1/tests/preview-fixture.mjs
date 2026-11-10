import {fixture} from './performance.fixture.mjs';
import {audit} from '../auditor.mjs';
import fs from 'node:fs/promises';
const f=await fixture();
const r=await audit({url:f.url,maxPages:1,maxElements:4,waitMs:500,concurrency:1,platforms:['ga4','dataLayer']});
await fs.mkdir(new URL('../reports/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../reports/preview-partial.json',import.meta.url),JSON.stringify(r));
console.log(JSON.stringify({url:f.url,file:'reports/preview-partial.json',status:r.status}));
process.on('SIGINT',async()=>{await f.close();process.exit();});
