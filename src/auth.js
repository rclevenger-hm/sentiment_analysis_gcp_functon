'use strict';
const { HttpError } = require('./input');
const unauthenticated = () => new HttpError(401, 'UNAUTHENTICATED', 'A valid Google ID token is required');
function createAuthenticator(config = process.env, verify) {
  const audience = config.TOKEN_AUDIENCE;
  const allowed = new Set((config.ALLOWED_CALLER_EMAILS || '').split(',').map((v) => v.trim()).filter(Boolean));
  if (!audience?.startsWith('https://') || allowed.size === 0) throw new Error('Configure TOKEN_AUDIENCE and ALLOWED_CALLER_EMAILS');
  let keys;
  return async function authenticate(authorization) {
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/i.test(authorization) || authorization.length > 16384) throw unauthenticated();
    let payload;
    try {
      const { createRemoteJWKSet, jwtVerify } = await import('jose');
      keys ||= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
      ({ payload } = await (verify || jwtVerify)(authorization.slice(7), keys, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub', 'email'], clockTolerance: 5 }));
      if (typeof payload.sub !== 'string' || !/^[0-9]{1,255}$/.test(payload.sub) || payload.email_verified !== true) throw unauthenticated();
    } catch { throw unauthenticated(); }
    if (!allowed.has(payload.email)) throw new HttpError(403, 'FORBIDDEN', 'Caller is not authorized for this service');
    return { issuer: 'https://accounts.google.com', subject: payload.sub };
  };
}