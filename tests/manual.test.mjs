import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRecording} from '../manual/report.js';
import {VERSION} from '../dist/release.js';
import {resumeRemaining} from '../dist/event-model.js';
import {validateResume} from '../checkpoint.mjs';
import {PLATFORM_IDS} from '../dist/platforms.js';
import {importedTimeline} from '../dist/timeline-model.js';
import {snapshotParameters} from '../manual/timeline-evidence.js';

test('manual reports map visits and clicks and keep network and queue evidence separate', () => {
  const root = 'https://example.com/';
  const route = root + '#/products';
  const recorder = createRecording(root, VERSION, 10000);
  recorder.navigate(route, 10100);
  const element = {text: 'Buy', tag: 'button', selector: '#buy', region: 'main'};
  recorder.read({page: route, title: 'Products', time: 10600,
    activities: [{type: 'click', page: route, time: 10400, element}],
    events: [{source: 'dataLayer', name: 'buy', time: 10600, parameters: {product: 'a'}}]});
  const ga = name => ({startedDateTime: new Date(10450).toISOString(), response: {status: 204},
    request: {url: 'https://www.google-analytics.com/g/collect?v=2&tid=G-TEST&en=' + name,
      headers: [{name: 'Cookie', value: 'secret'}]}});
  recorder.network({...ga('old'), startedDateTime: new Date(9500).toISOString()});
  recorder.network(ga('buy'));
  recorder.network(ga('page_view'));
  assert.equal(recorder.navigate('https://other.example/'), false);

  const report = recorder.report(12000);
  assert.equal(report.mode, 'manual');
  assert.deepEqual(report.options.platforms, PLATFORM_IDS);
  assert.equal(report.durationMs, 2000);
  assert.deepEqual(report.pages.map(page => page.url), [root, route]);
  assert.equal(report.summary.testedElements, 1);
  assert.deepEqual(report.events.map(event => [event.name, event.source, event.relationship]), [
    ['buy', 'dataLayer', 'after-click'], ['buy', 'network', 'after-click'], ['page_view', 'network', 'page']
  ]);
  assert.deepEqual(report.events[1].element, element);
  assert.equal(report.events[1].page, route);
  assert.equal(report.events[1].httpStatus, 204);
  assert.equal(report.events[0].platform, 'dataLayer');
  assert.equal(report.events[2].element, undefined);
  const timelineEvents = report.timeline.filter(row => row.type === 'event');
  assert.ok(timelineEvents.every(row => row.eventId && !row.observation && !row.details));
  assert.deepEqual(importedTimeline(report).find(row => row.source === 'dataLayer').evidence.parameters, {product:'a'});
  const v153 = {...report, timeline:report.timeline.map(({eventId, ...row}) => row)};
  assert.deepEqual(importedTimeline(v153).find(row => row.source === 'dataLayer').evidence.parameters, {product:'a'});
  assert.equal(recorder.delta(0, 20).find(row => row.eventId === report.events[1].id).details.httpStatus, 204);
  assert.doesNotMatch(JSON.stringify(report), /secret/);
  assert.equal(resumeRemaining(report), 0);
  assert.throws(() => validateResume(report), /antrean/);
});

test('parameter capture preserves nested analytics values and bounds oversized or sensitive payloads', () => {
  const raw = {event:'purchase', ecommerce:{items:[{item_id:'sku-1', quantity:2}]},
    access_token:'sensitive-fixture', long:'a'.repeat(30000)};
  Object.defineProperty(raw, 'getter', {enumerable:true, get(){throw Error('Do not read accessors');}});
  const preview = snapshotParameters(raw, {maxBytes:4096, redact:true, omitEvent:true});
  assert.deepEqual(preview.parameters.ecommerce, {items:[{item_id:'sku-1', quantity:2}]});
  assert.equal(preview.parameters.access_token, '[redacted]');
  assert.equal(preview.parameters.event, undefined);
  assert.equal(preview.parameters.getter, undefined);
  assert.equal(preview.parametersTruncated, true);
  assert.equal(preview.parametersRedacted, true);
  assert.ok(Buffer.byteLength(JSON.stringify(preview.parameters)) <= 4096);
});

test('extension manifest uses the release version and requests only loopback access', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../manual/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, VERSION);
  assert.equal(manifest.devtools_page, 'devtools.html');
  assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1/*']);
});

test('manual activity timeline excludes actions and analytics during a pause', () => {
  const root = 'https://example.com/';
  const recorder = createRecording(root, VERSION, 1000);
  const snapshot = (time, type, name) => ({page: root, time, documentId: 1,
    activities: [{type, page: root, time}], events: [{name, time, source: 'dataLayer'}]});
  recorder.read(snapshot(1100, 'scroll', 'first'));
  recorder.pause(1500);
  recorder.read(snapshot(1600, 'click', 'paused_event'));
  assert.equal(recorder.resume('https://elsewhere.example/', 2000), false);
  assert.equal(recorder.resume(root, 2500), true);
  recorder.network({startedDateTime: new Date(1600).toISOString(),
    request: {url: 'https://www.google-analytics.com/g/collect?v=2&tid=G-TEST&en=paused_network'}});
  recorder.read(snapshot(2700, 'submit', 'next'));
  const report = recorder.report(3000);
  assert.equal(report.durationMs, 1000);
  assert.deepEqual(report.timeline.map(row => row.type),
    ['navigation', 'scroll', 'event', 'pause', 'resume', 'submit', 'event']);
  assert.deepEqual(report.events.map(event => event.name), ['first', 'next']);
  assert.equal(report.summary.testedElements, 0);
});
