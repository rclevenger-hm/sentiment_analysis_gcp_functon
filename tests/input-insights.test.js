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
test('calendar dates and report filter ranges are validated', () => {
  assert.throws(() => dateOnly('2026-02-30')); assert.equal(dateOnly('2024-02-29'), '2024-02-29');
  assert.throws(() => filtersFrom({ from: '2026-10-02', to: '2026-10-01' })); assert.throws(() => filtersFrom({ minConfidence: 'nonsense' }));
});
test('Google issuer and subject scope caller data', () => {
  const identity = (issuer, subject) => ({ requestContext: { identity: { issuer, subject } } });
  assert.equal(tenantFrom(identity('one', 'alice')), tenantFrom(identity('one', 'alice')));
  assert.notEqual(tenantFrom(identity('one', 'alice')), tenantFrom(identity('two', 'alice')));
  assert.notEqual(tenantFrom(identity('one', 'alice')), tenantFrom(identity('one', 'bob')));
});
test('exports preserve quotes/newlines and neutralize spreadsheet formulas', () => {
  const csv = csvExport([{ id: '=HYPERLINK("x")', text: '\t=CMD()', source: 'plain', product: 'quoted "widget"' }]);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/); assert.match(csv, /"'\t=CMD\(\)"/); assert.match(csv, /quoted ""widget""/);
});