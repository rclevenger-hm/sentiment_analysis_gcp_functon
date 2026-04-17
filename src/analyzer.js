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
function createAnalyzer(client = new v1.LanguageServiceClient()) {
  const options = () => ({ timeout: 8000, retry: null });
  async function analyze(record, targeted) {
    const document = { content: record.text, type: 'PLAIN_TEXT', language: language(record.languageCode) };
    const [response] = await client.analyzeSentiment({ document, encodingType: 'UTF16' }, options());
    const result = { ...nativeSentiment(response.documentSentiment), sentiment: label(response.documentSentiment, response.sentences || []), labelPolicy: POLICY, languageCode: record.languageCode };
    if (targeted) {
      try {
        const [detail] = await client.analyzeEntitySentiment({ document, encodingType: 'UTF16' }, options());
        Object.assign(result, entitiesFrom(detail.entities, record.text));
      } catch (error) {
        if (transient(error) || [7, 16].includes(Number(error.code))) throw error;
        result.insightsError = safeError();
      }
    }
    return result;
  }
  return {
    async single(record, targeted = false) { return analyze(record, targeted); },
    async batch(records, targeted = false) {
      const output = records.map((record) => ({ ...record }));
      // Four documents in flight bounds API pressure and fits a 25-row checkpoint.
      for (let offset = 0; offset < records.length; offset += 4) {
        const settled = await Promise.allSettled(records.slice(offset, offset + 4).map(async (record, i) => {
          if (record.error) return;
          try { Object.assign(output[offset + i], await analyze(record, targeted)); }
          catch (error) {
            if (Number(error.code) !== 3) throw error; // Only InvalidArgument is a permanent row failure.
            output[offset + i].error = safeError();
          }
        }));
        const failure = settled.find((r) => r.status === 'rejected');
        if (failure) throw failure.reason;
      }
      return output;
    },
  };
}