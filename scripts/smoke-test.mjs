import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request } from './client.mjs';
if (!process.env.API_ENDPOINT) throw new Error('Set API_ENDPOINT and an authorized Google caller; this test makes billable inference calls');
const anonymous = await fetch(`${process.env.API_ENDPOINT}/usage`, { redirect: 'error' });
assert.ok([401, 403].includes(anonymous.status));
const call = async (path, options) => JSON.parse((await request(path, options)).text);
const body = JSON.stringify({ records: [{ id: 'positive', text: 'The product works wonderfully.' }, { id: 'negative', text: 'Delivery was terrible.' }, { id: 'invalid', text: '' }], targeted: true });
const idempotencyKey = randomUUID();
const job = await call('/jobs', { method: 'POST', body, idempotencyKey });
const again = await call('/jobs', { method: 'POST', body, idempotencyKey });
assert.equal(job.jobId, again.jobId);
let completed = false;
for (let attempt = 0; attempt < 36; attempt++) {
  const status = await call(`/jobs/${job.jobId}`);
  if (['COMPLETED', 'COMPLETED_WITH_ERRORS'].includes(status.status)) { completed = true; break; }
  assert.notEqual(status.status, 'FAILED');
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
assert.ok(completed, 'Job should complete within three minutes');
const results = await call(`/jobs/${job.jobId}/results`);
assert.equal(results.records.length, 3); assert.equal(results.records[2].id, 'invalid'); assert.ok(results.records[2].error);
const report = await call(`/jobs/${job.jobId}/report`); assert.equal(report.analyzed, 2); assert.equal(report.failed, 1);
const exported = await call(`/jobs/${job.jobId}/export?format=csv`);
assert.equal(exported.expiresInSeconds, 60);
const download = await fetch(exported.downloadUrl); assert.equal(download.status, 200); assert.match(await download.text(), /positive/);
console.log(`Smoke passed for job ${job.jobId}. Live records expire under the configured retention policy.`);
