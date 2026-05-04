'use strict';
const functions = require('@google-cloud/functions-framework');
const { createStore } = require('./store');
const { createAnalyzer } = require('./analyzer');
const { createHandler } = require('./handler');
const { createAuthenticator } = require('./auth');
const { createHttpAdapter, decodePush } = require('./http');
const { createWorker } = require('./worker');
let store, analyzer, api, worker;
function getStore() { return store ||= createStore(); }