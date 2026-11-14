'use strict';

/**
 * livetalk の撮影で、サーバー側の時計と Web Push の送信先を差し替える。
 *
 * サービスのコードを変えずに差し替えるため、NODE_OPTIONS の --require で読み込ませる。
 * - 時計: 画面の生活サイクル (就寝中か) や通知の判定、履歴の時刻は、サーバーの実時間で決まる。
 *   撮影のたびに画像が変わらないよう、`next start` のプロセスの Date を撮影の固定時刻に止める。
 *   ビルドや npm 自身の Date には触れない
 * - Web Push: web-push は https.request で購読の宛先へ送る。宛先の名前 (`push.capture.invalid`) への
 *   送信だけを、偽の Push サーバー (http) への通信に置き換える。他の通信には触れない
 */
const http = require('node:http');
const https = require('node:https');

const PUSH_HOST = 'push.capture.invalid';

const fixedNow = Date.parse(process.env.CAPTURE_SERVER_NOW ?? '');
const isNextStart = process.argv.some((arg) =>
  /[\\/]next$|[\\/]next[\\/]dist[\\/]bin[\\/]next$/.test(arg)
);
if (!Number.isNaN(fixedNow) && isNextStart && process.argv.includes('start')) {
  const RealDate = Date;
  global.Date = new Proxy(RealDate, {
    construct(target, args, newTarget) {
      return args.length === 0
        ? new target(fixedNow)
        : Reflect.construct(target, args, newTarget === global.Date ? target : newTarget);
    },
    apply(target) {
      return new target(fixedNow).toString();
    },
    get(target, prop, receiver) {
      if (prop === 'now') return () => fixedNow;
      return Reflect.get(target, prop, receiver);
    },
  });
}

const pushPort = process.env.CAPTURE_PUSH_PORT;
if (pushPort) {
  const original = https.request;
  https.request = function request(...args) {
    const options = args[0];
    const isPush =
      options !== null &&
      typeof options === 'object' &&
      !(options instanceof URL) &&
      (options.host === PUSH_HOST || options.hostname === PUSH_HOST);
    if (!isPush) {
      return original.apply(this, args);
    }
    // https 用の agent と暗号スイートの指定は、http の通信では使えない
    const { agent: _agent, ciphers: _ciphers, ...rest } = options;
    return http.request(
      {
        ...rest,
        host: '127.0.0.1',
        hostname: '127.0.0.1',
        port: Number(pushPort),
        protocol: 'http:',
      },
      ...args.slice(1)
    );
  };
}
