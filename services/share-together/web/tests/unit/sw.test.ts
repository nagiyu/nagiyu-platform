type Listener = (event: unknown) => void;

describe('sw.js', () => {
  const listeners: Record<string, Listener> = {};
  const fetchMock = jest.fn();
  const cacheMatchMock = jest.fn();
  const cachePutMock = jest.fn();
  const cacheOpenMock = jest.fn().mockResolvedValue({ put: cachePutMock });
  const cacheDeleteMock = jest.fn();
  const cacheKeysMock = jest.fn().mockResolvedValue([]);

  beforeEach(async () => {
    jest.resetModules();
    fetchMock.mockReset();
    cacheMatchMock.mockReset();
    cachePutMock.mockReset();
    cacheOpenMock.mockClear();
    cacheDeleteMock.mockReset();
    cacheKeysMock.mockReset();
    cacheKeysMock.mockResolvedValue([]);

    Object.assign(globalThis, {
      self: {
        addEventListener: jest.fn((type: string, listener: Listener) => {
          listeners[type] = listener;
        }),
        skipWaiting: jest.fn(),
        clients: { claim: jest.fn() },
      },
      fetch: fetchMock,
      caches: {
        match: cacheMatchMock,
        open: cacheOpenMock,
        keys: cacheKeysMock,
        delete: cacheDeleteMock,
      },
    });

    await import('../../public/sw.js');
  });

  it('GETリクエスト時はキャッシュより先にネットワークを優先する', async () => {
    const networkResponse = {
      status: 200,
      type: 'basic',
      clone: jest.fn().mockReturnValue({}),
    };
    fetchMock.mockResolvedValue(networkResponse);

    const respondWith = jest.fn();
    listeners.fetch({ request: { method: 'GET', url: 'https://example.com/test' }, respondWith });

    const responsePromise = respondWith.mock.calls[0][0];
    await expect(responsePromise).resolves.toBe(networkResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cacheOpenMock).toHaveBeenCalledTimes(1);
    expect(cachePutMock).toHaveBeenCalledTimes(1);
  });

  it('ネットワーク失敗時はキャッシュをフォールバックとして返す', async () => {
    const cachedResponse = { source: 'cache' };
    fetchMock.mockRejectedValue(new Error('network error'));
    cacheMatchMock.mockResolvedValue(cachedResponse);

    const respondWith = jest.fn();
    const request = { method: 'GET', url: 'https://example.com/fallback' };
    listeners.fetch({ request, respondWith });

    const responsePromise = respondWith.mock.calls[0][0];
    await expect(responsePromise).resolves.toBe(cachedResponse);
    expect(cacheMatchMock).toHaveBeenCalledWith(request);
  });

  it('GET以外のリクエストはservice workerで処理しない', () => {
    const respondWith = jest.fn();
    listeners.fetch({ request: { method: 'POST', url: 'https://example.com/post' }, respondWith });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(respondWith).not.toHaveBeenCalled();
  });

  it('status=200かつbasic以外のレスポンスはキャッシュ保存しない', async () => {
    fetchMock.mockResolvedValue({ status: 500, type: 'basic' });

    const respondWith = jest.fn();
    listeners.fetch({ request: { method: 'GET', url: 'https://example.com/error' }, respondWith });

    const responsePromise = respondWith.mock.calls[0][0];
    await expect(responsePromise).resolves.toEqual({ status: 500, type: 'basic' });
    expect(cacheOpenMock).not.toHaveBeenCalled();
    expect(cachePutMock).not.toHaveBeenCalled();
  });

  it('activate時に古いキャッシュのみ削除する', async () => {
    cacheKeysMock.mockResolvedValue(['share-together-v1', 'legacy-cache']);

    const waitUntil = jest.fn();
    listeners.activate({ waitUntil });

    await waitUntil.mock.calls[0][0];
    expect(cacheDeleteMock).toHaveBeenCalledWith('legacy-cache');
    expect(cacheDeleteMock).not.toHaveBeenCalledWith('share-together-v1');
  });
});
