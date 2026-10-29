'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { gzipSync } = require('node:zlib');

function message(child, event) {
  return new Promise((resolve, reject) => {
    const done = (error, value) => {
      clearTimeout(timer);
      child.off('message', received); child.off('exit', exited); child.off('error', failed);
      if (error) reject(error); else resolve(value);
    };
    const received = (value) => { if (value.event === event) done(null, value); };
    const exited = (code) => done(new Error(`Framework exited (${code}) while waiting for ${event}`));
    const failed = (error) => done(error);
    const timer = setTimeout(() => done(new Error(`Timed out waiting for ${event}`)), 5000);
    child.on('message', received); child.once('exit', exited); child.once('error', failed);
  });
}

test('real Functions Framework preserves the HTTP adapter boundary', { timeout: 30000 }, async (t) => {
  // A parser regression must fail this test, not crash the entire test runner.
  const child = fork(require.resolve('./framework-server'), { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      const force = setTimeout(() => child.kill('SIGKILL'), 1000);
      try { child.kill(); await exited; } finally { clearTimeout(force); }
    }
    if (child.exitCode) t.diagnostic(stderr);
  });
  const { port } = await message(child, 'ready');
  const url = `http://127.0.0.1:${port}`;
  const post = (body, type = 'application/json', encoding, authorization = 'Bearer test-identity') => fetch(`${url}/jobs?limit=3`, {
    method: 'POST', body, signal: AbortSignal.timeout(5000),
    headers: { authorization, 'content-type': type, ...(encoding ? { 'content-encoding': encoding } : {}) },
  });
  const verify = async (response, body) => {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { body, query: { limit: '3' }, identity: { issuer: 'test', subject: '123' } });
  };
  const json = '{"text":"Excellent café service"}';

  await t.test('JSON, CSV, forms and compressed JSON retain original UTF-8 bytes', async () => {
    await verify(await post(json), json);
    const csv = 'text\r\n"Excellent café service"\r\n';
    await verify(await post(csv, 'text/csv'), csv);
    const form = 'text=Excellent+caf%C3%A9+service';
    await verify(await post(form, 'application/x-www-form-urlencoded'), form);
    await verify(await post(gzipSync(json), 'application/json', 'gzip'), json);
  });

  await t.test('malformed, unauthorized and oversized decoded requests stay bounded', async () => {
    const malformed = await post('{');
    assert.equal(malformed.status, 400);
    await malformed.text();
    const unauthorized = await post(json, 'application/json', undefined, '');
    assert.equal(unauthorized.status, 401);
    assert.equal((await unauthorized.json()).code, 'UNAUTHENTICATED');
    const oversized = await post(gzipSync('a'.repeat(1024 * 1024 + 1)), 'text/csv', 'gzip');
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).code, 'REQUEST_TOO_LARGE');
    const invalidUtf8 = await post(Buffer.from([255]), 'text/csv');
    assert.equal(invalidUtf8.status, 400);
    assert.equal((await invalidUtf8.json()).code, 'INVALID_REQUEST');
    await verify(await post(json), json);
  });
});
