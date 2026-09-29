import { fetchForecastDetail } from '../../../../lib/forecast-view/fetch-detail';

const body = { tickerId: 'TSE:7203', date: '2025-09-25', questions: { DIR: null, VOL: null } };

describe('fetchForecastDetail', () => {
  it('ティッカー ID と基準日をエンコードして取得する', async () => {
    const fetchFn = jest.fn(async () => ({ ok: true, status: 200, json: async () => body }));

    const result = await fetchForecastDetail('TSE:7203', '2025-09-25', fetchFn as never);

    expect(fetchFn).toHaveBeenCalledWith('/api/forecasts/TSE%3A7203?date=2025-09-25');
    expect(result).toEqual({ status: 'ok', data: body });
  });

  it('基準日が空なら date を付けない', async () => {
    const fetchFn = jest.fn(async () => ({ ok: true, status: 200, json: async () => body }));

    await fetchForecastDetail('TSE:7203', '', fetchFn as never);

    expect(fetchFn).toHaveBeenCalledWith('/api/forecasts/TSE%3A7203');
  });

  it('404 は確度なしとして返す', async () => {
    const fetchFn = jest.fn(async () => ({ ok: false, status: 404 }));

    expect(await fetchForecastDetail('TSE:7203', '2025-09-25', fetchFn as never)).toEqual({
      status: 'unavailable',
    });
  });

  it('404 以外のエラー応答は error として返す', async () => {
    const fetchFn = jest.fn(async () => ({ ok: false, status: 500 }));

    expect(await fetchForecastDetail('TSE:7203', '2025-09-25', fetchFn as never)).toEqual({
      status: 'error',
    });
  });

  it('通信例外は投げずに error として返す', async () => {
    const fetchFn = jest.fn(async () => {
      throw new Error('network');
    });

    expect(await fetchForecastDetail('TSE:7203', '2025-09-25', fetchFn as never)).toEqual({
      status: 'error',
    });
  });

  it('既定では global fetch を使う', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => body,
    })) as unknown as typeof fetch;

    const result = await fetchForecastDetail('TSE:7203', '2025-09-25');

    expect(result.status).toBe('ok');
    expect(global.fetch).toHaveBeenCalled();
  });
});
