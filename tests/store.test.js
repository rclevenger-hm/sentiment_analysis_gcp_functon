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