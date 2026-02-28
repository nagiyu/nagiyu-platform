type RequestLike = { method: string; url: string };
type Listener = (event: {
  request: RequestLike;
  respondWith: (response: Promise<unknown>) => void;
}) => void;

describe('sw.js', () => {
  const listeners: Record<string, Listener> = {};
  const fetchMock = jest.fn();
  const cacheMatchMock = jest.fn();
  const cachePutMock = jest.fn();
  const cacheOpenMock = jest.fn().mockResolvedValue({ put: cachePutMock });

  beforeEach(async () => {
    jest.resetModules();
    fetchMock.mockReset();
    cacheMatchMock.mockReset();
    cachePutMock.mockReset();
    cacheOpenMock.mockClear();

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
        keys: jest.fn().mockResolvedValue([]),
        delete: jest.fn(),
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
});
