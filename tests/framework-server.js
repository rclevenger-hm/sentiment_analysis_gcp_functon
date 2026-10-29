'use strict';
const functions = require('@google-cloud/functions-framework');
const { getTestServer } = require('@google-cloud/functions-framework/testing');
const { createHttpAdapter } = require('../src/http');
const { HttpError } = require('../src/input');

const adapter = createHttpAdapter({
  authenticate: async (authorization) => {
    if (authorization !== 'Bearer test-identity') throw new HttpError(401, 'UNAUTHENTICATED', 'Token required');
    return { issuer: 'test', subject: '123' };
  },
  handler: async (event) => ({ statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    body: event.body, query: event.queryStringParameters, identity: event.requestContext.identity,
  }) }),
  logger: { error() {} },
});

functions.http('httpContract', adapter);
const server = getTestServer('httpContract');
server.listen(0, '127.0.0.1', () => process.send({ event: 'ready', port: server.address().port }));
