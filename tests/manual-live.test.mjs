import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createManualLive} from '../manual-live.mjs';

test('live timeline requires pairing, isolates origins, and replays offsets without duplicating rows', async () => {
  let now = 1000;
  const handler = createManualLive('dashboard-key', () => now);
  const origin = 'chrome-extension://' + 'a'.repeat(32);
  const root = 'https://example.com/';
  const path = 'http://127.0.0.1:4318/api/manual/live';
  const id = 'e180fb23-946e-4aef-8c10-9c637cb475b1';
  async function request(method, headers, body, query = '') {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    Object.assign(req, {method, headers});
    const res = {setHeader() {}, writeHead() {return this;}, end() {}};
    let response;
    assert.equal(await handler(req, res, new URL(path + query), (status, data) => response = {status, data}), true);
    return response;
  }
  const dashboard = {'x-atlas-token': 'dashboard-key'};
  assert.equal((await request('GET', {})).status, 403);
  const {data: {pairing}} = await request('GET', dashboard);
  const keys = {'x-atlas-pairing': pairing, origin};
  const payload = {id, root, offset: 0, status: 'recording', rows: [{type: 'click', page: root,
    time: now, element: {text: 'Buy', value: 'untrusted input'}, headers: {Cookie: 'private'}}]};
  assert.equal((await request('POST', {...keys, origin: 'https://attacker.example'}, payload)).status, 403);
  assert.equal((await request('POST', {...keys, 'x-atlas-pairing': 'wrong'}, payload)).status, 403);
  assert.equal((await request('POST', keys, payload)).status, 200);
  assert.equal((await request('POST', keys, payload)).data.offset, 1);
  assert.equal((await request('POST', keys, {...payload, rows: [{type: 'click', page: 'https://foreign.example', time: now}]})).status, 400);
  const another = {...payload, id: '0d0e0731-951e-4d03-accc-30fe7e82436d'};
  assert.equal((await request('POST', keys, another)).status, 409);
  const first = (await request('GET', dashboard)).data;
  assert.equal(first.total, 1);
  assert.equal(first.rows[0].element.text, 'Buy');
  assert.doesNotMatch(JSON.stringify(first.rows), /untrusted input|private/);
  assert.equal((await request('POST', keys, {...payload, rows: [], offset: 1, status: 'paused'})).status, 200);
  const delta = (await request('GET', dashboard, undefined, '?id=' + id + '&offset=1')).data;
  assert.equal(delta.status, 'paused');
  assert.deepEqual(delta.rows, []);
  const row = {type:'event', page:root, time:now, eventId:'manual-event-1', details:{
    parameters:{product:{id:'p1', api_key:'not-a-public-value'}}, measurementId:'G-TEST',
    endpoint:'https://example.com/g/collect', httpStatus:204
  }};
  assert.equal((await request('POST', keys, {...payload, rows:[row], offset:1})).data.offset, 2);
  assert.equal((await request('POST', keys, {...payload, rows:[row], offset:1})).data.offset, 2);
  const event = (await request('GET', dashboard, undefined, '?id=' + id + '&offset=1')).data.rows[0];
  assert.equal(event.detailAvailable, true);
  assert.equal(event.details, undefined);
  const detailQuery = '?id=' + id + '&detail=' + event.eventId;
  assert.equal((await request('GET', {}, undefined, detailQuery)).status, 403);
  const {data:{detail}} = await request('GET', dashboard, undefined, detailQuery);
  assert.deepEqual(detail.parameters, {product:{id:'p1', api_key:'[redacted]'}});
  assert.equal(detail.parametersRedacted, true);
  assert.equal(detail.httpStatus, 204);
  assert.equal(detail.measurementId, 'G-TEST');
  assert.equal((await request('GET', dashboard, undefined, '?id=other&detail=' + event.eventId)).status, 404);
  now += 16000;
  assert.equal((await request('GET', dashboard)).data.status, 'interrupted');
  assert.equal((await request('POST', keys, another)).status, 200);
});
