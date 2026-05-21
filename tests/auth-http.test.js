'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthenticator } = require('../src/auth');
const { createHttpAdapter, decodePush } = require('../src/http');
const { HttpError } = require('../src/input');
const email = 'consumer@example.iam.gserviceaccount.com';
const config = { TOKEN_AUDIENCE: 'https://region-project.cloudfunctions.net/service', ALLOWED_CALLER_EMAILS: email };
async function signer() {
  const jose = await import('jose'), keys = await jose.generateKeyPair('RS256');
  const token = async (claims = {}, options = {}) => new jose.SignJWT({ sub: '1234567890', email, email_verified: true, ...claims }).setProtectedHeader({ alg: 'RS256' }).setIssuer(options.issuer || 'https://accounts.google.com').setAudience(options.audience || config.TOKEN_AUDIENCE).setIssuedAt().setExpirationTime(options.exp || '5m').sign(keys.privateKey);
  const auth = createAuthenticator(config, (token, _keys, options) => jose.jwtVerify(token, keys.publicKey, options));
  return { token, auth };
}
test('Google ID token signature, issuer, audience and subject are verified', async () => {
  const f = await signer(); assert.deepEqual(await f.auth(`Bearer ${await f.token()}`), { issuer: 'https://accounts.google.com', subject: '1234567890' });
  assert.deepEqual(await f.auth(`Bearer ${await f.token({}, { issuer: 'accounts.google.com' })}`), { issuer: 'https://accounts.google.com', subject: '1234567890' });
});
for (const [label, claims, options] of [
  ['expired', {}, { exp: 1 }], ['wrong issuer', {}, { issuer: 'https://attacker.example' }], ['wrong audience', {}, { audience: 'another-function' }],
  ['missing subject', { sub: null }, {}], ['unverified email', { email_verified: false }, {}], ['non-string subject', { sub: 123 }, {}],
]) test(`Google token authentication rejects ${label}`, async () => { const f = await signer(); await assert.rejects(f.auth(`Bearer ${await f.token(claims, options)}`), (e) => e.status === 401); });
test('valid but unlisted callers are forbidden', async () => { const f = await signer(); await assert.rejects(f.auth(`Bearer ${await f.token({ email: 'other@example.com' })}`), (e) => e.status === 403); });
test('modified signatures cannot choose another principal', async () => {
  const f = await signer(); const parts = (await f.token()).split('.'); const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); payload.sub = '999999'; parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
  await assert.rejects(f.auth(`Bearer ${parts.join('.')}`), (e) => e.status === 401);
});
test('unsigned, malformed, missing and oversized tokens fail closed', async () => {
  const auth = createAuthenticator(config);
  for (const value of [undefined, '', 'Basic test', 'Bearer a b', 'Bearer eyJhbGciOiJub25lIn0.e30.', `Bearer ${'a'.repeat(20000)}`]) await assert.rejects(auth(value), (e) => e.status === 401);
});
function response() { return { status(code) { this.code = code; return this; }, set(headers) { this.headers = headers; return this; }, send(body) { this.body = body; return this; }, json(body) { this.body = body; return this; } }; }
const logger = { error() {} };
function request(body = '{}') { return { method: 'POST', path: '/jobs', originalUrl: '/jobs?limit=3', headers: { 'content-type': 'application/json' }, rawBody: Buffer.from(body) }; }
test('HTTP authenticates before parsing and ignores forged identity headers', async () => {
  let called = false; const adapter = createHttpAdapter({ authenticate: async () => { throw new HttpError(401, 'UNAUTHENTICATED', 'Token required'); }, handler: async () => { called = true; }, logger });
  const out = response(); await adapter({ ...request('{bad'), headers: { 'x-tenant-id': 'alice', 'x-goog-authenticated-user-id': 'forged' } }, out);
  assert.equal(out.code, 401); assert.equal(called, false); assert.ok(out.headers['x-request-id']);
});