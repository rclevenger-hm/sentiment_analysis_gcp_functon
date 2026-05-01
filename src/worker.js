'use strict';
const { summarize, evaluateRule } = require('./insights');
function message(value) {
  const data = typeof value === 'string' ? JSON.parse(value) : value;
  if (!/^[a-f0-9]{64}$/.test(data?.tenantId || '') || !/^[a-f0-9]{64}$/.test(data?.jobId || '')) throw new Error('Invalid queue message');
  return data;
}