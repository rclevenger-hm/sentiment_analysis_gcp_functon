'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
test('patched UUID dependency supports CloudEvents and Storage HTTP clients', () => {
  const frameworkRequire = createRequire(require.resolve('@google-cloud/functions-framework'));
  const { CloudEvent } = frameworkRequire('cloudevents');
  const event = new CloudEvent({ type: 'sentiment.test', source: '/tests', data: {} });
  assert.match(event.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const storageRequire = createRequire(require.resolve('@google-cloud/storage'));
  const { Gaxios } = storageRequire('gaxios');
  assert.equal(typeof new Gaxios().request, 'function');
  assert.equal(typeof require('@google-cloud/functions-framework').http, 'function');
});
