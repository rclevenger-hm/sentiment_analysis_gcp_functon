'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, event } = require('./helpers');
const { tenantFrom } = require('../src/input');
const parsed = (response) => JSON.parse(response.body);

test('single analysis authenticates, meters, preserves the response contract and correlation', async () => {
  const f = fixture(); const request = event('POST', '/analyze-sentiment', { text: 'good' });
  const response = await f.api(request);
  assert.equal(response.statusCode, 200); assert.equal(parsed(response).sentiment, 'POSITIVE');
  assert.equal(response.headers['x-request-id'], 'request-123');
  assert.match(response.headers['access-control-expose-headers'], /x-request-id/);
  assert.equal((await f.store.usage(tenantFrom(request))).units, 1);
});
for (const [body, expected] of [['null', 400], ['[]', 400], ['123', 400], ['{bad', 400], [{ text: 'x', languageCode: false }, 400], [{ text: 'x', languageCode: null }, 400], [{ text: '😀'.repeat(1251) }, 413]]) {
  test(`invalid request ${JSON.stringify(body).slice(0, 70)} receives a controlled error`, async () => {
    const f = fixture(); const response = await f.api(event('POST', '/analyze-sentiment', body));
    assert.equal(response.statusCode, expected); assert.ok(parsed(response).code); assert.equal(f.calls.length, 0);
  });
}
test('base64 JSON is decoded and UTF-8 byte limits are respected', async () => {
  const f = fixture(); const request = event('POST', '/analyze-sentiment', Buffer.from(JSON.stringify({ text: '😀'.repeat(1250) })).toString('base64'), { isBase64Encoded: true });
  assert.equal((await f.api(request)).statusCode, 200);
  assert.equal((await f.api({ ...request, body: 'invalid=base64' })).statusCode, 400);
  assert.equal((await f.api({ ...request, body: Buffer.from([0xff]).toString('base64') })).statusCode, 400);
});
test('authentication fails before parsing or metering and caller headers cannot choose another tenant', async () => {
  const f = fixture(); const response = await f.api(event('POST', '/analyze-sentiment', '{bad', { requestContext: {}, headers: { 'x-tenant-id': 'alice' } }));
  assert.equal(response.statusCode, 401); assert.equal(f.calls.length, 0); assert.equal(f.items.size, 0);
});
test('errors and success telemetry do not log submitted text or upstream secret details', async () => {
  const f = fixture(); f.analyzer.single = async () => { throw new Error('sensitive internal details'); };
  const response = await f.api(event('POST', '/analyze-sentiment', { text: 'private customer feedback' }));
  assert.equal(response.statusCode, 502);
  assert.doesNotMatch(JSON.stringify(f.logs) + response.body, /private customer|sensitive internal/);
});
test('parallel duplicate submissions reserve one allowance and reject reused keys with changed data', async () => {
  const f = fixture(); const request = event('POST', '/jobs', { records: [{ id: 'one', text: 'good' }] });
  const responses = await Promise.all([f.api(request), f.api(request)]);
  assert.deepEqual(responses.map((r) => r.statusCode), [202, 202]);
  assert.equal(parsed(responses[0]).jobId, parsed(responses[1]).jobId);
  assert.equal((await f.store.usage(tenantFrom(request))).units, 1);
  assert.equal((await f.api(event('POST', '/jobs', { records: [{ text: 'different' }] }))).statusCode, 409);
});
test('daily units are charged for targeted operations and block excess before inference', async () => {
  const f = fixture(2);
  assert.equal((await f.api(event('POST', '/analyze-sentiment', { text: 'good', targeted: true }))).statusCode, 200);
  const blocked = await f.api(event('POST', '/analyze-sentiment', { text: 'good' }));
  assert.equal(blocked.statusCode, 429); assert.ok(Number(blocked.headers['retry-after']) > 0); assert.equal(f.calls.length, 1);
});