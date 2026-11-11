'use strict';

/**
 * livetalk の撮影で、Web Push の送信先になる偽のサーバー。
 * どの購読への送信も、受け取って 201 を返すだけで、通知は届けない。
 *
 *   CAPTURE_PUSH_PORT=<port> node docs-site/capture/livetalk-fake-push-server.cjs
 */
const http = require('node:http');

const port = Number(process.env.CAPTURE_PUSH_PORT);

http
  .createServer((request, response) => {
    if (request.url === '/__health') {
      response.writeHead(200).end('ok');
      return;
    }
    request.resume();
    request.on('end', () => response.writeHead(201).end());
  })
  .listen(port, '127.0.0.1');
