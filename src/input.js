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