'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, parseBulk, tenantFrom, dateOnly, decodeBody } = require('../src/input');
const { csvExport, summarize, evaluateRule, filtersFrom } = require('../src/insights');
const { event } = require('./helpers');

test('CSV parser accepts quoted commas, escaped quotes, CRLF, BOM and embedded newlines', () => {
  const rows = parseCsv('\uFEFFid,text,source\r\none,"Great, but ""late""\nagain",reviews\r\n');
  assert.deepEqual(rows, [{ id: 'one', text: 'Great, but "late"\nagain', source: 'reviews' }]);
});
for (const csv of ['text,text\na,b', 'id\na', 'text\n"unclosed', 'text\n"closed"oops', 'text\na,b']) test(`reject malformed CSV ${csv}`, () => assert.throws(() => parseCsv(csv)));
test('bulk validation keeps invalid rows and assigns deterministic missing ids', () => {
  const result = parseBulk(event('POST', '/jobs', { targeted: true, records: [{ text: 'fine' }, null, { id: 'spanish', text: 'hola', languageCode: 'de' }] }));
  assert.equal(result.records[0].id, 'row-1'); assert.ok(result.records[1].error); assert.ok(result.records[2].error);
});
test('oversized encoded request is rejected before decoding', () => assert.throws(() => decodeBody({ body: 'a'.repeat(2 * 1024 * 1024), isBase64Encoded: true }), (e) => e.status === 413));