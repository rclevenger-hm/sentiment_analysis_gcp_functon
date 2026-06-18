'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorker, message } = require('../src/worker');
const { fixture, event } = require('./helpers');
const { tenantFrom } = require('../src/input');
test('queue messages require bounded hashed owner and job identifiers', () => {
  for (const value of [null, {}, '{bad', { tenantId: '../escape', jobId: 'a'.repeat(64) }]) assert.throws(() => message(value));
  assert.deepEqual(message(JSON.stringify({ tenantId: 'a'.repeat(64), jobId: 'b'.repeat(64) })), { tenantId: 'a'.repeat(64), jobId: 'b'.repeat(64) });
});
test('failed enqueue leaves durable job available for idempotent resubmission', async () => {
  const f = fixture(); const enqueue = f.store.enqueue; f.store.enqueue = async () => { throw new Error('queue unavailable'); };
  const request = event('POST', '/jobs', { records: [{ text: 'good' }] });
  assert.equal((await f.api(request)).statusCode, 503);
  f.store.enqueue = enqueue;
  assert.equal((await f.api(request)).statusCode, 202);
  assert.equal((await f.store.usage(tenantFrom(request))).units, 1);
  await f.tick(); assert.equal(f.calls.length, 1);
});