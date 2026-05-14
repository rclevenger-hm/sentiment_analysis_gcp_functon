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