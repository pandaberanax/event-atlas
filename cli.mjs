import {audit,saveReport} from './auditor.mjs';
import fs from 'node:fs/promises';
import {checkpointWriter} from './checkpoint.mjs';
const args = process.argv.slice(2); const get = (k,fallback) => args.includes(k) ? args[args.indexOf(k)+1] : fallback;
const abort = new AbortController(); process.on('SIGINT',()=>abort.abort());
let last = '';
const resume=get('--resume')?JSON.parse(await fs.readFile(get('--resume'),'utf8')):undefined;
if(!get('--url')&&!resume){console.error('Gunakan --url https://example.com atau --resume audit.json');process.exit(1);}
const writer=checkpointWriter(get('--checkpoint-dir','reports/checkpoints'));
const settings={resume,url:get('--url',resume?.root),scope:get('--scope',resume?.options.scope||'site'),platforms:get('--platforms')?.split(','),triggers:get('--triggers')?.split(','),maxPages:get('--pages',resume?.options.maxPages||100),maxElements:get('--elements',resume?.options.maxElements??12),speed:get('--speed',resume?.options.speed||'balanced'),resetPolicy:get('--reset','isolated'),assetCache:!args.includes('--no-cache'),concurrency:get('--workers'),waitMs:get('--wait'),consent:get('--consent','unchanged')};
const report = await audit(settings, r => {
  writer.observe(r);
  const state = `${r.summary.visited || 0}/${r.summary.discovered || 0} halaman | ${r.summary.observations || 0} observasi | ${r.status}`;
  if (state !== last) { console.log(state); last=state; }
},abort.signal);
await writer.finish(report);
await saveReport(report,get('--out','reports/latest'));
console.log(JSON.stringify({status:report.status,error:report.error,summary:report.summary}));
if (report.status==='error') process.exitCode=1;
