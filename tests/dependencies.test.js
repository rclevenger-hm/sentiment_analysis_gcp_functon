'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdtemp, mkdir, writeFile, readFile, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
test('patched UUID dependency supports CloudEvents and Storage HTTP clients', () => {
  const frameworkRequire = createRequire(require.resolve('@google-cloud/functions-framework'));
  const { CloudEvent } = frameworkRequire('cloudevents');
  const event = new CloudEvent({ type: 'sentiment.test', source: '/tests', data: {} });
  assert.match(event.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const storageRequire = createRequire(require.resolve('@google-cloud/storage'));
  const { Gaxios } = storageRequire('gaxios');
  assert.equal(typeof new Gaxios().request, 'function');
  assert.equal(typeof require('@google-cloud/functions-framework').http, 'function');
});

test('Firestore dependency cleanup preserves named exports, globbing and cancellation', async (t) => {
  const apiRequire = createRequire(require.resolve('@google-cloud/firestore-api'));
  const metadataRequire = createRequire(apiRequire.resolve('gcp-metadata'));
  const consumers = [
    createRequire(apiRequire.resolve('google-gax')),
    createRequire(metadataRequire.resolve('gaxios')),
  ];
  const root = await mkdtemp(join(tmpdir(), 'sentiment-dependencies-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const [index, consumerRequire] of consumers.entries()) {
    const { rimraf, rimrafSync } = consumerRequire('rimraf');
    const fixture = join(root, String(index));
    await mkdir(fixture);
    await writeFile(join(fixture, 'remove.tmp'), 'temporary');
    await writeFile(join(fixture, 'keep.txt'), 'keep');
    assert.equal(await rimraf(join(fixture, '*.tmp'), { glob: true }), true);
    assert.deepEqual(await readdir(fixture), ['keep.txt']);

    const controller = new AbortController();
    const reason = new Error('cancel dependency cleanup');
    controller.abort(reason);
    await assert.rejects(rimraf(join(fixture, '*.txt'), { glob: true, signal: controller.signal }), (error) => error === reason);
    assert.equal(await readFile(join(fixture, 'keep.txt'), 'utf8'), 'keep');
    assert.equal(rimrafSync(join(fixture, 'keep.txt')), true);
    assert.deepEqual(await readdir(fixture), []);
  }
});

test('Firestore clients and their legacy HTTP transport load with patched cleanup dependencies', async () => {
  const { Firestore } = require('@google-cloud/firestore');
  const apiRequire = createRequire(require.resolve('@google-cloud/firestore-api'));
  const { FirestoreClient } = apiRequire('@google-cloud/firestore-api');
  const metadataRequire = createRequire(apiRequire.resolve('gcp-metadata'));
  const { Gaxios } = metadataRequire('gaxios');
  const database = new Firestore({ projectId: 'dependency-test' });
  const client = new FirestoreClient({ projectId: 'dependency-test', fallback: true });
  try {
    assert.equal(database.doc('checks/compatibility').path, 'checks/compatibility');
    const transport = new Gaxios({
      fetchImplementation: async () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }),
    });
    const response = await transport.request({ url: 'https://dependency-test.invalid/check', retry: false });
    assert.equal(response.status, 200);
    assert.deepEqual(response.data, { ok: true });
  } finally {
    await client.close();
    await database.terminate();
  }
});
