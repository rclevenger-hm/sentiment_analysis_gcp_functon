'use strict';
const { randomUUID } = require('node:crypto');
const { HttpError, MAX_REQUEST_BYTES, parseJson } = require('./input');
function decodeRaw(request, limit = MAX_REQUEST_BYTES) {
  const raw = request.rawBody;
  if (!Buffer.isBuffer(raw)) throw new HttpError(400, 'INVALID_REQUEST', 'Raw request body is required');
  if (raw.length > limit) throw new HttpError(413, 'REQUEST_TOO_LARGE', 'Request body exceeds limit');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { throw new HttpError(400, 'INVALID_REQUEST', 'Request body must be valid UTF-8'); }
}
function createHttpAdapter({ authenticate, handler, logger = console }) {
  return async (request, response) => {
    const requestId = randomUUID();
    try {
      const identity = await authenticate(request.headers.authorization);
      const body = ['GET', 'HEAD'].includes(request.method) ? '' : decodeRaw(request);
      const query = Object.fromEntries(new URL(request.originalUrl || request.url, 'https://internal').searchParams);
      const result = await handler({ httpMethod: request.method, path: request.path, headers: request.headers, body, queryStringParameters: query, requestContext: { requestId, identity } });
      response.status(result.statusCode).set(result.headers).send(result.body);
    } catch (error) {
      const known = error instanceof HttpError;
      logger.error(JSON.stringify({ event: 'http_error', requestId, errorName: error.name }));
      response.status(known ? error.status : 503).set({ 'cache-control': 'no-store', 'x-request-id': requestId }).json({ code: known ? error.code : 'SERVICE_UNAVAILABLE', error: known ? error.message : 'Service temporarily unavailable', requestId });
    }
  };
}
function decodePush(request) {
  const envelope = parseJson(decodeRaw(request, 8192));
  const encoded = envelope.message?.data;
  if (typeof encoded !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('Invalid Pub/Sub envelope');
  return parseJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(encoded, 'base64')));
}