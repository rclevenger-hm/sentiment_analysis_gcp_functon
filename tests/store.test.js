'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../src/store');
const { hash } = require('../src/input');
const { firestoreFake, storageFake } = require('./firestore-fake');
function setup(config = {}) {
  const db = firestoreFake(), blob = storageFake(), sent = [];
  let time = new Date('2026-09-01T10:00:00Z');
  const store = createStore({ db: db.db, storage: blob.storage, topic: { async publishMessage({ json }) { sent.push(json); } }, config, clock: () => time });
  const job = (name = 'one', tenantId = 'alice') => ({ tenantId, key: `JOB#${hash(name)}`, jobId: hash(name), inputKey: `${tenantId}/input.json`, fingerprint: name, status: 'QUEUED', offset: 0, total: 2, expiresAt: store.expiry(), createdAt: time.toISOString(), updatedAt: time.toISOString(), collectionId: `${tenantId}#jobs` });
  return { ...db, ...blob, store, job, sent, advance: (seconds) => { time = new Date(time.getTime() + seconds * 1000); } };
}
test('parallel identical jobs create one row and charge once in Firestore transaction', async () => {
  const f = setup(); const results = await Promise.all(Array.from({ length: 6 }, () => f.store.createJob(f.job(), 2)));
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal((await f.store.usage('alice')).units, 2);
  assert.equal([...f.records.values()].filter((r) => r.status).length, 1);
});
test('competing jobs at quota cannot overdraw and rejected transaction leaves no job', async () => {
  const f = setup({ DAILY_ANALYSIS_LIMIT: 3 });
  const results = await Promise.allSettled([f.store.createJob(f.job('a'), 2), f.store.createJob(f.job('b'), 2)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.status, 429);
  assert.equal((await f.store.usage('alice')).units, 2);
  assert.equal([...f.records.values()].filter((r) => r.status).length, 1);
});
test('concurrent single reservations cannot exceed quota', async () => {
  const f = setup({ DAILY_ANALYSIS_LIMIT: 3 });
  const result = await Promise.allSettled(Array.from({ length: 6 }, () => f.store.reserveUsage('alice', 1)));
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 3);
  assert.equal((await f.store.usage('alice')).units, 3);
});
test('usage resets at UTC midnight and remains isolated by tenant', async () => {
  const f = setup({ DAILY_ANALYSIS_LIMIT: 1 }); await f.store.reserveUsage('alice', 1); await f.store.reserveUsage('bob', 1);
  f.advance(86400); assert.equal((await f.store.usage('alice')).units, 0); await f.store.reserveUsage('alice', 1);
});
test('per-minute rate limit is atomic and rolls over independently of daily quota', async () => {
  const f = setup({ REQUESTS_PER_MINUTE: 2 });
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => f.store.reserveRequest('alice')));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'RATE_LIMIT_EXCEEDED');
  f.advance(60); await f.store.reserveRequest('alice'); assert.equal((await f.store.usage('alice')).units, 0);
});
test('backend outages remain unavailable rather than being reported as quota errors', async () => {
  const f = setup(); f.db.failCommit = true;
  await assert.rejects(f.store.reserveUsage('alice', 1), (e) => e.code === 14);
});
test('expired rows are unreadable before asynchronous TTL cleanup', async () => {
  const f = setup(); await f.store.createJob(f.job(), 1); f.advance(31 * 86400);
  assert.equal(await f.store.get('alice', f.job().key), null);
  await assert.rejects(f.store.getJob('alice', f.job().jobId), (e) => e.status === 404);
  await assert.rejects(f.store.createJob(f.job(), 1), (e) => e.code === 'EXPIRED_KEY');
});