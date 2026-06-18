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
test('failed final checkpoint never publishes an alert independently', async () => {
  const f = fixture(); await f.api(event('PUT', '/alert-rule', { enabled: true, minRecords: 1, negativeRate: 0.5 }));
  await f.api(event('POST', '/jobs', { records: [{ text: 'bad' }] }));
  f.store.checkpoint = async () => { throw new Error('transaction failed'); };
  await assert.rejects(f.tick(), /transaction failed/);
  const response = await f.api(event('GET', '/alerts')); assert.equal(JSON.parse(response.body).alerts.length, 0);
});