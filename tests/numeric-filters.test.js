'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { filtersFrom, validateRule, evaluateRule } = require('../src/insights');
const fields = ['minScore', 'maxScore', 'minMagnitude'];
const rule = (filters) => ({ enabled: true, minRecords: 1, negativeRate: 0.5, filters });
const invalid = (error) => error.status === 400 && error.code === 'INVALID_REQUEST';

for (const key of fields) {
  test(`${key} rejects values that would be coerced into unrelated thresholds`, () => {
    for (const value of [null, false, true, [], [0], [0.5], {}, '', ' ', '\t\r\n', '0x0', '0b0', '0o0', 'NaN', 'Infinity', '-Infinity', '1e999', NaN, Infinity, -Infinity]) {
      assert.throws(() => filtersFrom({ [key]: value }), invalid, `query ${JSON.stringify(value)}`);
      assert.throws(() => validateRule(rule({ [key]: value })), invalid, `rule ${JSON.stringify(value)}`);
    }
  });
  test(`${key} supports finite decimal query strings and numeric JSON rules`, () => {
    for (const [text, expected] of [['0', 0], ['0.5', 0.5], ['.5', 0.5], ['1', 1], ['+1.0', 1], ['5e-1', 0.5], [' 0.5 ', 0.5]]) {
      assert.equal(filtersFrom({ [key]: text })[key], expected);
      assert.equal(validateRule(rule({ [key]: expected })).filters[key], expected);
      assert.throws(() => validateRule(rule({ [key]: text })), invalid);
    }
  });
}

test('numeric filter bounds and score ordering remain enforced', () => {
  for (const key of ['minScore', 'maxScore']) {
    for (const value of [-1, '-1', '-1e0']) assert.equal(filtersFrom({ [key]: value })[key], -1);
    for (const value of [-1.001, 1.001, '-1.001', '1.001']) assert.throws(() => filtersFrom({ [key]: value }), invalid);
  }
  assert.equal(filtersFrom({ minMagnitude: '1e3' }).minMagnitude, 1000);
  for (const value of [-0.001, '-0.001']) assert.throws(() => filtersFrom({ minMagnitude: value }), invalid);
  for (const filters of [{ minScore: 0.5, maxScore: 0 }, { minScore: '0.5', maxScore: '0' }]) assert.throws(() => filtersFrom(filters), invalid);
  assert.deepEqual(filtersFrom({ minScore: '0', maxScore: '0' }), { minScore: 0, maxScore: 0 });
  assert.deepEqual(validateRule(rule({})).filters, {});
});

test('a null minimum cannot silently exclude negative feedback from an alert', () => {
  const records = [{ id: 'negative-review', sentiment: 'NEGATIVE', score: -0.9, magnitude: 0.9 }];
  assert.equal(evaluateRule(validateRule(rule({})), records, '2026-10-12').negativeRate, 1);
  assert.throws(() => validateRule(rule({ minScore: null })), invalid);
});
