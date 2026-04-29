'use strict';

const { randomUUID } = require('node:crypto');
const { HttpError, TARGETED_LANGUAGES, invalid, hash, header, decodeBody, parseJson, parseBulk, validateText, tenantFrom } = require('./input');
const { filtersFrom, filterResults, summarize, compare, csvExport, validateRule } = require('./insights');
const { final } = require('./store');

function publicJob(job) {
  return { jobId: job.jobId, label: job.label, status: job.status, createdAt: job.createdAt,
    updatedAt: job.updatedAt, total: job.total, processed: job.offset,
    progress: job.total ? Math.round(job.offset / job.total * 100) : 0,
    targeted: job.targeted, summary: job.summary, failureReason: job.failureReason,
    expiresAt: new Date(job.expiresAt * 1000).toISOString() };
}