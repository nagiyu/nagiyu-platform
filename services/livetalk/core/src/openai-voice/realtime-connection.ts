import type OpenAI from 'openai';
import { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type { RealtimeConnection, RealtimeConnector } from './types.js';

/**
 * OpenAI SDK のネイティブ WebSocket 版 Realtime 接続を {@link RealtimeConnection} に合わせる。
 *
 * 追加の WebSocket パッケージを入れず、Node 標準の WebSocket を使うために SDK の
 * ネイティブ版を選んでいる。
 *
 * @param client - エンドポイントと API キーを持つ OpenAI クライアント
 */
export function createDefaultRealtimeConnector(client: OpenAI): RealtimeConnector {
  return async (model: string): Promise<RealtimeConnection> => {
    const ws = await OpenAIRealtimeWebSocket.create(client, { model });
    return {
      send: (event) => ws.send(event),
      close: () => ws.close(),
      onOpen: (listener) => ws.socket.addEventListener('open', () => listener()),
      onEvent: (listener) => ws.on('event', listener),
      onError: (listener) => ws.on('error', listener),
      onClose: (listener) => ws.socket.addEventListener('close', () => listener()),
    };
  };
}
