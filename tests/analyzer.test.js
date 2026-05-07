'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAnalyzer, label, entitiesFrom, nativeSentiment } = require('../src/analyzer');
const { filtersFrom, filterResults } = require('../src/insights');
const { parseBulk, validateText } = require('../src/input');
const score = (score, magnitude = 1) => ({ score, magnitude });
test('sentiment labels follow declared thresholds and opposing sentence evidence', () => {
  assert.equal(label(score(0.25)), 'POSITIVE'); assert.equal(label(score(-0.25)), 'NEGATIVE'); assert.equal(label(score(0.1)), 'NEUTRAL');
  assert.equal(label(score(0.7), [{ sentiment: score(0.9) }, { sentiment: score(-0.8) }]), 'MIXED');
  assert.equal(label(score(0, 5)), 'NEUTRAL'); // Magnitude alone does not prove mixed opinions.
});