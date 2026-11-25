import type OpenAI from 'openai';
import { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type { RealtimeConnection, RealtimeConnector } from './types.js';

/**
 * OpenAI SDK のネイティブ WebSocket 版 Realtime 接続を {@link RealtimeConnection} に合わせる。
 *
 * 追加の WebSocket パッケージを入れず、Node 標準の WebSocket を使うために SDK の
 * ネイティブ版を選んでいる。
 *
 * open / error / close はソケット作成直後にこちらで受け取って状態を覚え、後からリスナーが
 * 登録された時点で渡す。SDK の `error` はリスナー不在だと unhandled rejection になり、
 * open / close はリスナー登録前に起きると取りこぼすため、呼び出し側が接続を受け取った後に
 * await を挟んでも失われないようにしている。`onEvent` は取りこぼし対策をしておらず、
 * open 後にクライアントイベントを送ってから届くサーバーイベントだけを前提にしている。
 *
 * @param client - エンドポイントと API キーを持つ OpenAI クライアント
 */
export function createDefaultRealtimeConnector(client: OpenAI): RealtimeConnector {
  return async (model: string): Promise<RealtimeConnection> => {
    const ws = await OpenAIRealtimeWebSocket.create(client, { model });

    let opened = false;
    let closed = false;
    const errors: Error[] = [];
    const openListeners: Array<() => void> = [];
    const errorListeners: Array<(error: Error) => void> = [];
    const closeListeners: Array<() => void> = [];

    // 登録の await 越しに失われないよう、ここで同期的に受け取る
    ws.socket.addEventListener('open', () => {
      opened = true;
      openListeners.forEach((listener) => listener());
    });
    ws.socket.addEventListener('close', () => {
      closed = true;
      closeListeners.forEach((listener) => listener());
    });
    ws.on('error', (error: Error) => {
      errors.push(error);
      errorListeners.forEach((listener) => listener(error));
    });

    return {
      send: (event) => ws.send(event),
      close: () => ws.close(),
      onOpen: (listener) => {
        openListeners.push(listener);
        if (opened) listener();
      },
      onEvent: (listener) => ws.on('event', listener),
      onError: (listener) => {
        errorListeners.push(listener);
        errors.forEach((error) => listener(error));
      },
      onClose: (listener) => {
        closeListeners.push(listener);
        if (closed) listener();
      },
    };
  };
}
