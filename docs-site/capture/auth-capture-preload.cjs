'use strict';

/**
 * auth の撮影で、サーバー側の Stripe への通信を偽のサーバーへ向ける。
 *
 * サービスのコードを変えずに差し替えるため、NODE_OPTIONS の --require で読み込ませる。
 * Stripe の SDK は api.stripe.com への https 通信を https.request で行うので、
 * その呼び出しだけを偽のサーバー (http) への通信に置き換える。他の通信には触れない。
 */
const http = require('node:http');
const https = require('node:https');

const port = process.env.CAPTURE_FAKE_PORT;

if (port) {
  const original = https.request;
  https.request = function request(...args) {
    const options = args[0];
    const isStripe =
      options !== null &&
      typeof options === 'object' &&
      !(options instanceof URL) &&
      (options.host === 'api.stripe.com' || options.hostname === 'api.stripe.com');
    if (!isStripe) {
      return original.apply(this, args);
    }
    // https 用の agent と暗号スイートの指定は、http の通信では使えない
    const { agent: _agent, ciphers: _ciphers, ...rest } = options;
    return http.request(
      { ...rest, host: '127.0.0.1', hostname: '127.0.0.1', port: Number(port), protocol: 'http:' },
      ...args.slice(1)
    );
  };
}
