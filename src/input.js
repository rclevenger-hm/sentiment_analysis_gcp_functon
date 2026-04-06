'use strict';

const { createHash } = require('node:crypto');
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_TEXT_BYTES = 5000;
const MAX_RECORDS = 200;
const LANGUAGES = new Set(['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'zh', 'zh-TW', 'zh-Hant', 'nl', 'id', 'th', 'tr', 'vi']);
const TARGETED_LANGUAGES = new Set(['en', 'es', 'ja']);
class HttpError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const invalid = (message) => new HttpError(400, 'INVALID_REQUEST', message);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function header(event, name) {
  return Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

function decodeBody(event) {
  if (typeof event.body !== 'string') throw invalid('Request body must be a string');
  if (event.body.length > Math.ceil(MAX_REQUEST_BYTES / 3) * 4) {
    throw new HttpError(413, 'REQUEST_TOO_LARGE', 'Request body exceeds 1 MiB');
  }
  let bytes;
  if (event.isBase64Encoded === true) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(event.body)) {
      throw invalid('Request body is not valid base64');
    }
    bytes = Buffer.from(event.body, 'base64');
  } else bytes = Buffer.from(event.body, 'utf8');
  if (bytes.length > MAX_REQUEST_BYTES) throw new HttpError(413, 'REQUEST_TOO_LARGE', 'Request body exceeds 1 MiB');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw invalid('Request body must be valid UTF-8'); }
}