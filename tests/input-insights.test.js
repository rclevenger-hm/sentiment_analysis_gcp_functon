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