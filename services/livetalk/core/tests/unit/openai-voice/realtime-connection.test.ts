import type OpenAI from 'openai';
import { createDefaultRealtimeConnector } from '../../../src/openai-voice/realtime-connection.js';

const mockCreate = jest.fn();
jest.mock('openai/realtime/websocket', () => ({
  OpenAIRealtimeWebSocket: { create: (...args: unknown[]) => mockCreate(...args) },
}));

describe('createDefaultRealtimeConnector', () => {
  const client = {} as unknown as OpenAI;

  function makeWs() {
    const socketListeners: Record<string, () => void> = {};
    const wsListeners: Record<string, (arg: unknown) => void> = {};
    return {
      socketListeners,
      wsListeners,
      ws: {
        send: jest.fn(),
        close: jest.fn(),
        on: jest.fn((name: string, cb: (arg: unknown) => void) => {
          wsListeners[name] = cb;
        }),
        socket: {
          addEventListener: jest.fn((name: string, cb: () => void) => {
            socketListeners[name] = cb;
          }),
        },
      },
    };
  }

  it('指定モデルで SDK の WebSocket を作る', async () => {
    const { ws } = makeWs();
    mockCreate.mockResolvedValue(ws);

    await createDefaultRealtimeConnector(client)('gpt-realtime-2.1-mini');

    expect(mockCreate).toHaveBeenCalledWith(client, { model: 'gpt-realtime-2.1-mini' });
  });

  it('send / close を SDK にそのまま委譲する', async () => {
    const { ws } = makeWs();
    mockCreate.mockResolvedValue(ws);
    const connection = await createDefaultRealtimeConnector(client)('m');

    connection.send({ type: 'response.cancel' });
    connection.close();

    expect(ws.send).toHaveBeenCalledWith({ type: 'response.cancel' });
    expect(ws.close).toHaveBeenCalled();
  });

  it('open / close は native socket、event / error は SDK のイベントを購読する', async () => {
    const { ws, socketListeners, wsListeners } = makeWs();
    mockCreate.mockResolvedValue(ws);
    const connection = await createDefaultRealtimeConnector(client)('m');
    const onOpen = jest.fn();
    const onClose = jest.fn();
    const onEvent = jest.fn();
    const onError = jest.fn();

    connection.onOpen(onOpen);
    connection.onClose(onClose);
    connection.onEvent(onEvent);
    connection.onError(onError);
    socketListeners.open();
    socketListeners.close();
    wsListeners.event({ type: 'session.created' });
    wsListeners.error(new Error('x'));

    expect(onOpen).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledWith({ type: 'session.created' });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
