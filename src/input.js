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

function parseJson(text) {
  try { const value = JSON.parse(text); if (!object(value)) throw invalid('Request body must be a JSON object'); return value; }
  catch (error) { if (error instanceof HttpError) throw error; throw invalid('Request body must contain valid JSON'); }
}

function validateText(value) {
  if (!object(value)) throw invalid('Each record must be an object');
  if (typeof value.text !== 'string' || !value.text.trim()) throw invalid('text must be a non-empty string');
  const text = value.text.trim();
  if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) throw new HttpError(413, 'TEXT_TOO_LARGE', 'text must be 5000 UTF-8 bytes or fewer');
  const languageCode = value.languageCode === undefined ? 'en' : value.languageCode;
  if (typeof languageCode !== 'string' || !LANGUAGES.has(languageCode)) throw invalid('Unsupported languageCode');
  return { text, languageCode };
}

// RFC 4180-style parser: quoted commas, escaped quotes, CRLF, and embedded newlines.
function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false; let closed = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"') {
      if (field || closed) throw invalid('Invalid CSV quoting');
      quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false;
      if (c !== ',') {
        rows.push(row); row = [];
        if (c === '\r' && text[i + 1] === '\n') i++;
        if (rows.length > MAX_RECORDS + 1) throw invalid(`At most ${MAX_RECORDS} records are allowed`);
      }
    } else {
      if (closed) throw invalid('Unexpected text after a closing CSV quote');
      field += c;
    }
  }
  if (quoted) throw invalid('Unclosed CSV quote');
  if (field || row.length || closed) { row.push(field); rows.push(row); }
  const headings = rows.shift()?.map((s) => s.trim());
  const allowed = new Set(['id', 'text', 'languageCode', 'date', 'product', 'source']);
  if (!headings?.includes('text') || new Set(headings).size !== headings.length || headings.some((s) => !allowed.has(s))) {
    throw invalid('CSV needs a text column; allowed columns: id,text,languageCode,date,product,source');
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === '')).map((values, index) => {
    if (values.length !== headings.length) throw invalid(`CSV row ${index + 2} has the wrong number of columns`);
    return Object.fromEntries(headings.map((key, i) => [key, values[i]]).filter(([key, value]) => value !== '' || key === 'text'));
  });
}