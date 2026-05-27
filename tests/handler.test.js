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