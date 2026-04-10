'use strict';

const { invalid, dateOnly, object } = require('./input');
const SENTIMENTS = new Set(['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED']);

function filtersFrom(query = {}) {
  const filters = {};
  if (query.sentiment !== undefined) {
    if (!SENTIMENTS.has(query.sentiment)) throw invalid('Invalid sentiment filter');
    filters.sentiment = query.sentiment;
  }
  for (const key of ['product', 'source', 'languageCode']) if (query[key] !== undefined) {
    if (typeof query[key] !== 'string' || query[key].length > 120) throw invalid(`Invalid ${key} filter`);
    filters[key] = query[key];
  }
  for (const key of ['from', 'to']) if (query[key] !== undefined) filters[key] = dateOnly(query[key]);
  if (filters.from && filters.to && filters.from > filters.to) throw invalid('from must be before to');
  if (query.minConfidence !== undefined) throw invalid('Google sentiment does not provide confidence; use minScore, maxScore or minMagnitude');
  for (const key of ['minScore', 'maxScore', 'minMagnitude']) if (query[key] !== undefined) {
    const value = Number(query[key]);
    if (query[key] === '' || !Number.isFinite(value) || (key === 'minMagnitude' ? value < 0 : value < -1 || value > 1)) throw invalid(`Invalid ${key}`);
    filters[key] = value;
  }
  if (filters.minScore !== undefined && filters.maxScore !== undefined && filters.minScore > filters.maxScore) throw invalid('minScore must be at most maxScore');
  return filters;
}