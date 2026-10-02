import { NextRequest } from 'next/server';
import { GET } from '../../../../app/api/forecasts/[tickerId]/route';
import {
  createDailySummaryRepository,
  createForecastRepository,
  createModelSnapshotRepository,
  createTickerRepository,
} from '../../../../lib/repository-factory';
import { forecastEntity, probabilityRecord, snapshot } from '../../lib/forecast/fixtures';

jest.mock('../../../../lib/repository-factory', () => ({
  createDailySummaryRepository: jest.fn(),
  createForecastRepository: jest.fn(),
  createModelSnapshotRepository: jest.fn(),
  createTickerRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { userId: 'test-user' } }, ...args);
  }),
}));

describe('GET /api/forecasts/[tickerId]', () => {
  const mockGetTickerById = jest.fn();
  const mockGetByExchange = jest.fn();
  const mockGetForecast = jest.fn();
  const mockGetSnapshot = jest.fn();

  const call = (query = '', tickerId = 'NSDQ:AAPL') =>
    GET(new NextRequest(`http://localhost/api/forecasts/${tickerId}${query}`), {
      params: Promise.resolve({ tickerId }),
    });

  beforeEach(() => {
    jest.clearAllMocks();
    (createTickerRepository as jest.Mock).mockReturnValue({ getById: mockGetTickerById });
    (createDailySummaryRepository as jest.Mock).mockReturnValue({
      getByExchange: mockGetByExchange,
    });
    (createForecastRepository as jest.Mock).mockReturnValue({
      getByTickerAndDate: mockGetForecast,
    });
    (createModelSnapshotRepository as jest.Mock).mockReturnValue({ getByDate: mockGetSnapshot });

    mockGetTickerById.mockResolvedValue({ TickerID: 'NSDQ:AAPL', ExchangeID: 'NASDAQ-ID' });
    mockGetByExchange.mockResolvedValue([{ TickerID: 'NSDQ:AAPL', Date: '2026-05-01' }]);
    mockGetForecast.mockResolvedValue(
      forecastEntity({ Probabilities: { DIR: probabilityRecord() } })
    );
    mockGetSnapshot.mockResolvedValue(snapshot());
  });

  it('正常系: date 省略時は取引所の最新日の確度を返す（取引所 ID はマスタから引く）', async () => {
    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetByExchange).toHaveBeenCalledWith('NASDAQ-ID');
    expect(mockGetForecast).toHaveBeenCalledWith('NSDQ:AAPL', '2026-05-01');
    expect(mockGetSnapshot).toHaveBeenCalledWith('DIR', 'US', '2026-05-01');
    expect(mockGetSnapshot).toHaveBeenCalledWith('VOL', 'US', '2026-05-01');
    expect(body.tickerId).toBe('NSDQ:AAPL');
    expect(body.questions.DIR.probability).toBe(0.56);
    expect(body.questions.VOL).toBeNull();
  });

  it('正常系: date 指定時は最新日を引かない', async () => {
    forecastEntity();
    const response = await call('?date=2026-04-30');

    expect(response.status).toBe(200);
    expect(mockGetByExchange).not.toHaveBeenCalled();
    expect(mockGetForecast).toHaveBeenCalledWith('NSDQ:AAPL', '2026-04-30');
  });

  it('異常系: date の形式が不正なら 400', async () => {
    const response = await call('?date=2026-13-01');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_DATE');
    expect(body.message).toBe('日付はYYYY-MM-DD形式で指定してください');
  });

  it('異常系: tickerId が空なら 400', async () => {
    const response = await call('', '');
    expect(response.status).toBe(400);
  });

  it('異常系: ティッカーが無ければ 404', async () => {
    mockGetTickerById.mockResolvedValue(null);
    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toBe('ティッカーが見つかりません');
  });

  it('異常系: サマリーが 1 件も無く date も無ければ 404', async () => {
    mockGetByExchange.mockResolvedValue([]);
    const response = await call();
    expect(response.status).toBe(404);
  });

  it('異常系: 指定日の Forecast が無ければ 404', async () => {
    mockGetForecast.mockResolvedValue(null);
    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toBe('指定日の確度が見つかりません');
  });

  it('異常系: リポジトリが失敗したら 500', async () => {
    mockGetTickerById.mockRejectedValue(new Error('db error'));
    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'INTERNAL_ERROR', message: '確度の取得に失敗しました' });
  });
});
