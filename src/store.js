'use strict';
const { randomUUID } = require('node:crypto');
const { Firestore, FieldPath } = require('@google-cloud/firestore');
const { Storage } = require('@google-cloud/storage');
const { PubSub } = require('@google-cloud/pubsub');
const { HttpError, invalid, hash } = require('./input');
const final = (s) => ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'].includes(s);
const clean = (v) => JSON.parse(JSON.stringify(v));
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found');
const quotaError = () => new HttpError(429, 'DAILY_LIMIT_EXCEEDED', 'Daily analysis allowance exceeded; resets at 00:00 UTC');
function createStore({ db, storage, topic, config = process.env, clock = () => new Date() } = {}) {
  db ||= new Firestore({ projectId: config.GCP_PROJECT_ID, databaseId: config.FIRESTORE_DATABASE });
  storage ||= new Storage({ projectId: config.GCP_PROJECT_ID });
  topic ||= new PubSub({ projectId: config.GCP_PROJECT_ID }).topic(config.JOB_TOPIC);
  const bucket = storage.bucket(config.DATA_BUCKET);
  const collection = db.collection('items');
  const quota = Number(config.DAILY_ANALYSIS_LIMIT || 1000), rate = Number(config.REQUESTS_PER_MINUTE || 60), retention = Number(config.DATA_RETENTION_DAYS || 30);
  if (![quota, rate, retention].every((n) => Number.isInteger(n) && n > 0)) throw new Error('Invalid quota/rate/retention configuration');
  const now = () => Math.floor(clock().getTime() / 1000);
  const ref = (tenant, key) => collection.doc(hash(`${tenant}:${key}`));
  const doc = (value) => ({ ...clean(value), expiresOn: new Date(value.expiresAt * 1000) });
  const data = (snapshot) => snapshot.exists ? snapshot.data() : null;
  const tx = (fn) => db.runTransaction(fn, { maxAttempts: 8 });
  const usageKey = () => `USAGE#${clock().toISOString().slice(0, 10)}`;
  async function mutate(tenant, key, change) {
    return tx(async (transaction) => {
      const reference = ref(tenant, key), old = data(await transaction.get(reference));
      if (!old || old.expiresAt <= now()) throw notFound();
      const next = change(old); if (!next) return null;
      transaction.set(reference, doc(next)); return next;
    });
  }
  async function saveObject(path, body, contentType, disposition) {
    const file = bucket.file(path);
    try { await file.save(body, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType, ...(disposition ? { contentDisposition: disposition } : {}) } }); }
    catch (error) {
      if (Number(error.code) !== 412) throw error;
      const [existing] = await file.download();
      if (hash(existing) !== hash(body)) throw new Error('Immutable object conflict');
    }
  }
  const store = {
    expiry: () => now() + retention * 86400,
    async putObject(path, value) { await saveObject(path, JSON.stringify(value), 'application/json'); },
    async getObject(path) { const [body] = await bucket.file(path).download(); return JSON.parse(body.toString('utf8')); },
    async exportFile(path, content, format) {
      await saveObject(path, content, format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json', `attachment; filename="sentiment-results.${format}"`);
      const [url] = await bucket.file(path).getSignedUrl({ version: 'v4', action: 'read', expires: new Date(clock().getTime() + 60000) });
      return url;
    },
    async get(tenant, key) { const item = data(await ref(tenant, key).get()); return item && item.expiresAt > now() ? item : null; },
    async getJob(tenant, jobId) { const job = await store.get(tenant, `JOB#${jobId}`); if (!job) throw notFound(); return job; },
    async reserveRequest(tenantId) {
      const key = `RATE#${clock().toISOString().slice(0, 16)}`;
      await tx(async (transaction) => {
        const reference = ref(tenantId, key), old = data(await transaction.get(reference));
        if ((old?.units || 0) >= rate) throw new HttpError(429, 'RATE_LIMIT_EXCEEDED', 'Request rate exceeded; retry in one minute');
        transaction.set(reference, doc({ tenantId, key, units: (old?.units || 0) + 1, expiresAt: now() + 120 }));
      });
    },
    async reserveUsage(tenantId, units) {
      const key = usageKey();
      await tx(async (transaction) => {
        const reference = ref(tenantId, key), old = data(await transaction.get(reference));
        if (!Number.isInteger(units) || units < 0 || (old?.units || 0) + units > quota) throw quotaError();
        transaction.set(reference, doc({ tenantId, key, units: (old?.units || 0) + units, expiresAt: now() + 3 * 86400 }));
      });
    },
    async createJob(job, units) {
      const key = usageKey();
      return tx(async (transaction) => {
        const jobRef = ref(job.tenantId, job.key), usageRef = ref(job.tenantId, key);
        const existing = data(await transaction.get(jobRef));
        if (existing) {
          if (existing.expiresAt <= now()) throw new HttpError(409, 'EXPIRED_KEY', 'Use a new Idempotency-Key');
          return { job: existing, created: false };
        }
        const used = data(await transaction.get(usageRef));
        if (!Number.isInteger(units) || units < 0 || (used?.units || 0) + units > quota) throw quotaError();
        transaction.create(jobRef, doc({ ...job, parts: [] }));
        transaction.set(usageRef, doc({ tenantId: job.tenantId, key, units: (used?.units || 0) + units, expiresAt: now() + 3 * 86400 }));
        return { job: { ...job, parts: [] }, created: true };
      });
    },
    async enqueue(tenantId, jobId) { await topic.publishMessage({ json: { tenantId, jobId } }); },
    async claim(tenant, jobId) {
      try {
        return await mutate(tenant, `JOB#${jobId}`, (job) => {
          if (final(job.status) || job.leaseUntil > now()) return null;
          if ((job.attempts || 0) >= 5) return { ...job, status: 'FAILED', failureReason: 'Worker retry limit exceeded. Completed records remain available.', updatedAt: clock().toISOString() };
          return { ...job, status: 'RUNNING', attempts: (job.attempts || 0) + 1, leaseToken: randomUUID(), leaseUntil: now() + 240, updatedAt: clock().toISOString() };
        }).then((job) => job?.status === 'RUNNING' ? job : null);
      } catch (e) { if (e.status === 404) return null; throw e; }
    },
    async checkpoint(job, offset, summary, part, alert) {
      await tx(async (transaction) => {
        const reference = ref(job.tenantId, job.key), current = data(await transaction.get(reference));
        if (!current || current.status !== 'RUNNING' || current.expiresAt <= now() || current.leaseUntil <= now() || current.leaseToken !== job.leaseToken || current.offset !== job.offset) throw new HttpError(409, 'LEASE_LOST', 'Worker lease expired');
        const next = { ...current, offset, parts: [...(current.parts || []), part], status: summary ? (summary.failed || summary.insightFailures ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED') : 'QUEUED', updatedAt: clock().toISOString(), ...(summary ? { summary } : {}) };
        delete next.leaseToken; delete next.leaseUntil; delete next.attempts;
        transaction.set(reference, doc(next));
        if (alert) transaction.create(ref(job.tenantId, `ALERT#${job.jobId}`), doc({ tenantId: job.tenantId, key: `ALERT#${job.jobId}`, collectionId: `${job.tenantId}#alerts`, jobId: job.jobId, alert, acknowledged: false, createdAt: clock().toISOString(), expiresAt: job.expiresAt }));
      });
    },
    async results(job) {
      const records = (await Promise.all((job.parts || []).map((p) => store.getObject(p)))).flat();
      if (job.status === 'FAILED' && job.offset < job.total) {
        const input = await store.getObject(job.inputKey);
        records.push(...input.records.slice(job.offset).map((r) => ({ ...r, error: r.error || { code: 'JOB_FAILED', message: 'Retry limit exceeded before this record completed' } })));
      }
      return records;
    },
    async list(tenant, collectionName, { limit = 20, cursor, from, to, status } = {}) {
      const signature = hash(JSON.stringify({ tenant, collectionName, from, to, status })); let start;
      if (cursor) {
        try {
          if (cursor.length > 2048) throw invalid('Invalid cursor');
          start = JSON.parse(Buffer.from(cursor, 'base64url').toString());
          if (start.signature !== signature || typeof start.createdAt !== 'string' || !/^[a-f0-9]{64}$/.test(start.id || '')) throw invalid('Invalid cursor');
        } catch { throw invalid('Invalid cursor'); }
      }
      let query = collection.where('tenantId', '==', tenant).where('collectionId', '==', `${tenant}#${collectionName}`).where('createdAt', '>=', from ? `${from}T00:00:00.000Z` : '0000').where('createdAt', '<=', to ? `${to}T23:59:59.999Z` : '9999');
      if (status) query = query.where('status', '==', status);
      query = query.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
      if (start) query = query.startAfter(start.createdAt, start.id);
      const page = await query.limit(limit + 1).get(); const visible = page.docs.slice(0, limit), last = visible.at(-1);
      return { items: visible.map(data).filter((v) => v.expiresAt > now()), nextCursor: page.docs.length > limit ? Buffer.from(JSON.stringify({ signature, createdAt: last.data().createdAt, id: last.id })).toString('base64url') : null };
    },
    async putRule(tenantId, rule) { await ref(tenantId, 'RULE#default').set(doc({ tenantId, key: 'RULE#default', rule, expiresAt: store.expiry() })); },
    async acknowledge(tenant, jobId) { await mutate(tenant, `ALERT#${jobId}`, (value) => ({ ...value, acknowledged: true })); },
    async usage(tenant) { const date = clock().toISOString().slice(0, 10), value = await store.get(tenant, `USAGE#${date}`); return { date, units: value?.units || 0, limit: quota, unit: 'accepted inference operations; targeted analysis counts twice', resetsAt: new Date(Date.parse(date) + 86400000).toISOString() }; },
    async claimRecovery() {
      return tx(async (transaction) => {
        const reference = ref('system-recovery', 'RECOVERY#cursor'), old = data(await transaction.get(reference));
        if (old?.leaseUntil > now()) return null;
        const state = { tenantId: 'system-recovery', key: 'RECOVERY#cursor', cursor: old?.cursor || null, leaseToken: randomUUID(), leaseUntil: now() + 180, expiresAt: store.expiry() };
        transaction.set(reference, doc(state)); return state;
      });
    },
    async saveRecoveryCursor(cursor, token, release = false) {
      await mutate('system-recovery', 'RECOVERY#cursor', (state) => {
        if (state.leaseToken !== token || state.leaseUntil <= now()) throw new HttpError(409, 'LEASE_LOST', 'Recovery lease expired');
        return { ...state, cursor: cursor || null, ...(release ? { leaseUntil: 0 } : {}) };
      });
    },
    async recover(cursor) {
      let query = collection.where('status', 'in', ['QUEUED', 'RUNNING']).where('updatedAt', '<', new Date(clock().getTime() - 15 * 60000).toISOString()).orderBy('updatedAt').orderBy(FieldPath.documentId());
      if (cursor) query = query.startAfter(cursor.updatedAt, cursor.id);
      const page = await query.limit(100).get();
      for (const snapshot of page.docs) { const job = snapshot.data(); if (job.expiresAt > now() && (!job.leaseUntil || job.leaseUntil <= now())) await store.enqueue(job.tenantId, job.jobId); }
      const last = page.docs.at(-1);
      return page.docs.length === 100 ? { updatedAt: last.data().updatedAt, id: last.id } : null;
    },
  };
  return store;
}
module.exports = { createStore, final };
