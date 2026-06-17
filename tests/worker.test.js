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