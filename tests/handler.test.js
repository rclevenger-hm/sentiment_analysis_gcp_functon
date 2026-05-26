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