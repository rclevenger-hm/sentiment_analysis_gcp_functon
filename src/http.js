'use strict';
const { randomUUID } = require('node:crypto');
const { HttpError, MAX_REQUEST_BYTES, parseJson } = require('./input');
function decodeRaw(request, limit = MAX_REQUEST_BYTES) {
  const raw = request.rawBody;
  if (!Buffer.isBuffer(raw)) throw new HttpError(400, 'INVALID_REQUEST', 'Raw request body is required');
  if (raw.length > limit) throw new HttpError(413, 'REQUEST_TOO_LARGE', 'Request body exceeds limit');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { throw new HttpError(400, 'INVALID_REQUEST', 'Request body must be valid UTF-8'); }
}