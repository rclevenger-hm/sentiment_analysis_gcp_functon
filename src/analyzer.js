'use strict';
const { v1 } = require('@google-cloud/language');
const POLICY = 'sentence-polarity-v1';
const TRANSIENT = new Set([1, 2, 4, 8, 10, 13, 14]);
const transient = (e) => TRANSIENT.has(Number(e?.code)) || [408, 429].includes(Number(e?.statusCode)) || Number(e?.statusCode) >= 500;
const language = (value) => value === 'zh-TW' ? 'zh-Hant' : value;
const safeError = () => ({ code: 'ANALYSIS_FAILED', message: 'Analysis could not be completed for this record' });
function nativeSentiment(value) {
  if (!value || !Number.isFinite(value.score) || value.score < -1 || value.score > 1 || !Number.isFinite(value.magnitude) || value.magnitude < 0) throw new Error('Malformed Google sentiment');
  return { score: value.score, magnitude: value.magnitude };
}
function label(value, sentences = []) {
  const { score } = nativeSentiment(value);
  const values = sentences.map((s) => nativeSentiment(s.sentiment).score);
  if (values.some((s) => s >= 0.25) && values.some((s) => s <= -0.25)) return 'MIXED';
  return score >= 0.25 ? 'POSITIVE' : score <= -0.25 ? 'NEGATIVE' : 'NEUTRAL';
}
function entitiesFrom(entities, text) {
  return { entities: (entities || []).slice(0, 10).map((entity) => ({
    name: String(entity.name || '').slice(0, 160), salience: entity.salience,
    ...nativeSentiment(entity.sentiment),
    mentions: (entity.mentions || []).slice(0, 3).map((mention) => {
      const content = String(mention.text?.content || ''); const beginOffset = mention.text?.beginOffset;
      if (!Number.isInteger(beginOffset) || beginOffset < 0 || text.slice(beginOffset, beginOffset + content.length) !== content) throw new Error('Invalid entity source offset');
      return { text: content.slice(0, 160), type: entity.type, sentiment: label(mention.sentiment), ...nativeSentiment(mention.sentiment), beginOffset, endOffset: beginOffset + content.length,
        excerpt: text.slice(Math.max(0, beginOffset - 40), beginOffset + content.length + 40).slice(0, 240) };
    }), truncated: (entity.mentions || []).length > 3,
  })), entitiesTruncated: (entities || []).length > 10, offsetEncoding: 'UTF16' };
}