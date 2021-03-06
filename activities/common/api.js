'use strict';

const got = require('got');
const HttpAgent = require('agentkeepalive');
const HttpsAgent = HttpAgent.HttpsAgent;

let _activity = null;

function api(path, opts) {
  if (typeof path !== 'string') {
    return Promise.reject(new TypeError(`Expected \`path\` to be a string, got ${typeof path}`));
  }

  let agent = {
    http: new HttpAgent(),
    https: new HttpsAgent()
  };

  if (_activity.Context.ProxyServer && _activity.Context.ProxyServer.agent) {
    agent = _activity.Context.ProxyServer.agent;
  }

  // determine if sandbox or not
  const key = _activity.Context.connector.custom2.toLowerCase();
  const endpoint = key.indexOf('tsk_') !== -1 ? 'https://sandbox.iexapis.com/v1' : 'https://cloud.iexapis.com/v1';

  opts = Object.assign({
    json: true,
    token: _activity.Context.connector.token,
    endpoint: endpoint,
    agent: agent
  }, opts);

  opts.headers = Object.assign({
    accept: 'application/json',
    'user-agent': 'adenin Digital Assistant, https://www.adenin.com/digital-assistant/'
  }, opts.headers);

  if (opts.token) opts.headers.Authorization = `Bearer ${opts.token}`;

  const url = /^http(s)\:\/\/?/.test(path) ? path : opts.endpoint + path;

  if (opts.stream) return got.stream(url, opts);

  return got(url, opts).catch((err) => {
    throw err;
  });
}

const helpers = [
  'get',
  'post',
  'put',
  'patch',
  'head',
  'delete'
];

api.initialize = (activity) => {
  _activity = activity;
};

api.stream = (url, opts) => got(url, Object.assign({}, opts, {
  json: false,
  stream: true
}));

for (const x of helpers) {
  const method = x.toUpperCase();
  api[x] = (url, opts) => api(url, Object.assign({}, opts, {method}));
  api.stream[x] = (url, opts) => api.stream(url, Object.assign({}, opts, {method}));
}

module.exports = api;
