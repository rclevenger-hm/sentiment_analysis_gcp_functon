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