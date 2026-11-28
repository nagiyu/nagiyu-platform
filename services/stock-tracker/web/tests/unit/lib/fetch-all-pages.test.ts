import { fetchAllPages } from '../../../lib/fetch-all-pages';

const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

describe('fetchAllPages', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('1 ページで終わるときは limit=100 で 1 回だけ取得する', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ holdings: [1, 2], pagination: { count: 2 } }));

    await expect(fetchAllPages<number>('/api/holdings', 'holdings')).resolves.toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/holdings?limit=100');
  });

  it('lastKey が返らなくなるまで辿って配列をつなぎ、lastKey をエンコードして付ける', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ alerts: [1], pagination: { count: 1, lastKey: 'a/b' } })
      )
      .mockResolvedValueOnce(jsonResponse({ alerts: [2], pagination: { count: 1, lastKey: 'c' } }))
      .mockResolvedValueOnce(jsonResponse({ alerts: [3], pagination: { count: 1 } }));

    await expect(fetchAllPages<number>('/api/alerts', 'alerts')).resolves.toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/alerts?limit=100&lastKey=a%2Fb');
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/alerts?limit=100&lastKey=c');
  });

  it('配列キーが無い応答は空として扱う', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await expect(fetchAllPages('/api/alerts', 'alerts')).resolves.toEqual([]);
  });

  it('応答が失敗したら例外にする', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(fetchAllPages('/api/alerts', 'alerts')).rejects.toThrow(
      '一覧の取得に失敗しました'
    );
  });

  it('同じ lastKey が続けて返ったら打ち切って例外にする', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ alerts: [1], pagination: { lastKey: 'k' } }))
      .mockResolvedValueOnce(jsonResponse({ alerts: [2], pagination: { lastKey: 'k' } }));

    await expect(fetchAllPages('/api/alerts', 'alerts')).rejects.toThrow(
      '一覧の取得が先に進まないため中断しました'
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
