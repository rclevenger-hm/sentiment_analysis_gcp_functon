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
test('only one worker claims a job and an expired lease can be reclaimed', async () => {
  const f = setup(); await f.store.createJob(f.job(), 2);
  const claims = await Promise.all([f.store.claim('alice', f.job().jobId), f.store.claim('alice', f.job().jobId)]);
  assert.equal(claims.filter(Boolean).length, 1); f.advance(241);
  const replacement = await f.store.claim('alice', f.job().jobId);
  assert.notEqual(replacement.leaseToken, claims.find(Boolean).leaseToken);
});
test('stale worker cannot commit result pointers, status, or alerts after lease replacement', async () => {
  const f = setup(); await f.store.createJob(f.job(), 2); const stale = await f.store.claim('alice', f.job().jobId);
  f.advance(241); const current = await f.store.claim('alice', f.job().jobId);
  await f.store.putObject('new', [{ id: 'winner' }]);
  await f.store.checkpoint(current, 2, { failed: 0 }, 'new', { type: 'test' });
  await f.store.putObject('old', [{ id: 'stale' }]);
  await assert.rejects(f.store.checkpoint(stale, 2, { failed: 0 }, 'old', { type: 'bad' }), (e) => e.code === 'LEASE_LOST');
  const finished = await f.store.getJob('alice', f.job().jobId);
  assert.deepEqual(await f.store.results(finished), [{ id: 'winner' }]);
  assert.equal((await f.store.get('alice', `ALERT#${finished.jobId}`)).alert.type, 'test');
});
test('checkpoint rejects an expired lease even before another worker claims', async () => {
  const f = setup(); await f.store.createJob(f.job(), 2); const job = await f.store.claim('alice', f.job().jobId);
  f.advance(241); await assert.rejects(f.store.checkpoint(job, 2, {}, 'part'), (e) => e.code === 'LEASE_LOST');
});
test('five failed claims reach a terminal state and preserve unprocessed record failures', async () => {
  const f = setup(); const job = f.job(); await f.store.createJob(job, 2); await f.store.putObject(job.inputKey, { records: [{ id: 'a' }, { id: 'b' }] });
  for (let i = 0; i < 5; i++) { assert.ok(await f.store.claim('alice', job.jobId)); f.advance(241); }
  assert.equal(await f.store.claim('alice', job.jobId), null);
  const failed = await f.store.getJob('alice', job.jobId); assert.equal(failed.status, 'FAILED');
  assert.deepEqual((await f.store.results(failed)).map((r) => r.error.code), ['JOB_FAILED', 'JOB_FAILED']);
});
test('checkpoint retries reset attempts so long jobs are not capped at five parts', async () => {
  const f = setup(); await f.store.createJob(f.job(), 2); const job = await f.store.claim('alice', f.job().jobId);
  await f.store.checkpoint(job, 1, undefined, 'one');
  const next = await f.store.claim('alice', job.jobId); assert.equal(next.attempts, 1); assert.equal(next.offset, 1);
});
test('history pagination is tenant scoped and bound to filters', async () => {
  const f = setup(); await f.store.createJob(f.job('one'), 1); f.advance(1); await f.store.createJob(f.job('two'), 1); await f.store.createJob(f.job('other', 'bob'), 1);
  const page = await f.store.list('alice', 'jobs', { limit: 1 }); assert.equal(page.items.length, 1); assert.ok(page.nextCursor);
  assert.equal((await f.store.list('alice', 'jobs', { limit: 1, cursor: page.nextCursor })).items.length, 1);
  for (const [tenant, collection, options] of [['bob', 'jobs', {}], ['alice', 'alerts', {}], ['alice', 'jobs', { status: 'FAILED' }]]) await assert.rejects(f.store.list(tenant, collection, { cursor: page.nextCursor, ...options }), (e) => e.status === 400);
});
test('recovery only requeues old unfinished work and persists continuation state', async () => {
  const f = setup(); const job = f.job(); await f.store.createJob(job, 2); await f.store.recover(); assert.equal(f.sent.length, 0);
  f.advance(901); await f.store.recover(); assert.equal(f.sent.length, 1);
  const state = await f.store.claimRecovery(); await f.store.saveRecoveryCursor('token', state.leaseToken); assert.equal((await f.store.get('system-recovery', 'RECOVERY#cursor')).cursor, 'token');
});
test('alert acknowledgement never reopens an acknowledged alert', async () => {
  const f = setup(); await f.store.createJob(f.job(), 2); const job = await f.store.claim('alice', f.job().jobId);
  await f.store.checkpoint(job, 2, { failed: 0 }, 'part', { type: 'threshold' });
  await f.store.acknowledge('alice', job.jobId); await f.store.acknowledge('alice', job.jobId);
  assert.equal((await f.store.get('alice', `ALERT#${job.jobId}`)).acknowledged, true);
  await assert.rejects(f.store.acknowledge('bob', job.jobId), (e) => e.status === 404);
});
test('transaction failure rolls back job creation and usage together', async () => {
  const f = setup(); f.db.failCommit = true;
  await assert.rejects(f.store.createJob(f.job(), 2), /Backend unavailable/);
  assert.equal(f.records.size, 0);
  f.db.failCommit = false; await f.store.createJob(f.job(), 2);
  assert.equal((await f.store.usage('alice')).units, 2);
});
test('immutable storage accepts identical retries and rejects changed content', async () => {
  const f = setup(); await f.store.putObject('one', { text: 'original' }); await f.store.putObject('one', { text: 'original' });
  await assert.rejects(f.store.putObject('one', { text: 'changed' }), /Immutable/);
  assert.deepEqual(await f.store.getObject('one'), { text: 'original' });
});
test('exports request a read-only V4 URL expiring in sixty seconds', async () => {
  const f = setup(); const url = await f.store.exportFile('export.csv', 'id,text', 'csv');
  assert.match(url, /^https:/); assert.equal(f.signing[0].action, 'read'); assert.equal(f.signing[0].version, 'v4');
  assert.equal(f.signing[0].expires.toISOString(), '2026-09-01T10:01:00.000Z');
});