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
test('invalid rows never call the provider and provider InvalidArgument becomes a row error', async () => {
  let calls = 0; const analyzer = createAnalyzer({ async analyzeSentiment() { calls++; throw Object.assign(new Error('secret text'), { code: 3 }); } });
  const rows = await analyzer.batch([{ id: 'invalid', error: { code: 'INVALID' } }, { id: 'provider', text: 'x', languageCode: 'en' }]);
  assert.equal(calls, 1); assert.equal(rows[0].error.code, 'INVALID'); assert.equal(rows[1].error.code, 'ANALYSIS_FAILED'); assert.doesNotMatch(JSON.stringify(rows), /secret text/);
});
for (const code of [4, 7, 8, 13, 14, 16]) test(`provider error ${code} retries rather than completing false failures`, async () => {
  const analyzer = createAnalyzer({ async analyzeSentiment() { throw Object.assign(new Error('retry'), { code }); } });
  await assert.rejects(analyzer.batch([{ text: 'x', languageCode: 'en' }]), /retry/);
});
test('permanent entity-insight failure preserves overall sentiment explicitly', async () => {
  const analyzer = createAnalyzer({ async analyzeSentiment() { return [{ documentSentiment: score(-0.8), sentences: [] }]; }, async analyzeEntitySentiment() { throw Object.assign(new Error('unsupported'), { code: 3 }); } });
  const result = await analyzer.single({ text: 'bad', languageCode: 'en' }, true); assert.equal(result.sentiment, 'NEGATIVE'); assert.ok(result.insightsError);
});
test('transient entity errors propagate for worker retry', async () => {
  const analyzer = createAnalyzer({ async analyzeSentiment() { return [{ documentSentiment: score(0.8), sentences: [] }]; }, async analyzeEntitySentiment() { throw Object.assign(new Error('transient'), { code: 14 }); } });
  await assert.rejects(analyzer.batch([{ text: 'good', languageCode: 'en' }], true), /transient/);
});
test('entity evidence uses UTF-16 and bounds entities, mentions and excerpts', () => {
  const entity = { name: 'battery', type: 'CONSUMER_GOOD', salience: 0.5, sentiment: score(-0.8), mentions: Array.from({ length: 5 }, () => ({ text: { content: 'battery', beginOffset: 3 }, sentiment: score(-0.8) })) };
  const result = entitiesFrom(Array.from({ length: 12 }, () => entity), '😀 battery is bad');
  assert.equal(result.entities.length, 10); assert.equal(result.entities[0].mentions.length, 3); assert.ok(result.entities[0].truncated); assert.ok(result.entitiesTruncated);
  const mention = result.entities[0].mentions[0]; assert.equal('😀 battery is bad'.slice(mention.beginOffset, mention.endOffset), 'battery');
  assert.throws(() => entitiesFrom([{ ...entity, mentions: [{ text: { content: 'missing', beginOffset: -1 }, sentiment: score(0) }] }], 'x'));
});
test('malformed native scores are never silently interpreted as neutral', () => {
  for (const value of [null, {}, score(NaN), score(2), score(0, -1)]) assert.throws(() => nativeSentiment(value));
});