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
  };
  return store;
}