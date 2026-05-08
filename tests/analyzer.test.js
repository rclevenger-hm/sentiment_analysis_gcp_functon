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
test('Google native score and magnitude are preserved without confidence fabrication', async () => {
  const analyzer = createAnalyzer({ async analyzeSentiment() { return [{ documentSentiment: score(0.6, 1.8), sentences: [] }]; } });
  const result = await analyzer.single({ text: 'good', languageCode: 'en' });
  assert.equal(result.score, 0.6); assert.equal(result.magnitude, 1.8); assert.equal(result.sentimentScore, undefined); assert.equal(result.labelPolicy, 'sentence-polarity-v1');
});
test('batch concurrency is bounded at four and stable order survives completion races', async () => {
  let active = 0, maximum = 0;
  const analyzer = createAnalyzer({ async analyzeSentiment() { active++; maximum = Math.max(active, maximum); await new Promise((resolve) => setTimeout(resolve, 2)); active--; return [{ documentSentiment: score(0.8), sentences: [] }]; } });
  const records = Array.from({ length: 25 }, (_, i) => ({ id: String(i), text: 'good', languageCode: 'en' }));
  const results = await analyzer.batch(records); assert.equal(maximum, 4); assert.deepEqual(results.map((r) => r.id), records.map((r) => r.id));
});