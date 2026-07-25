import { POST, DELETE } from '../../../../app/api/test/reset/route';
import {
  clearMemoryStore,
  createExchangeRepository,
  createTickerRepository,
  createHoldingRepository,
  createAlertRepository,
} from '../../../../lib/repository-factory';

jest.mock('../../../../lib/repository-factory', () => ({
  clearMemoryStore: jest.fn(),
  createExchangeRepository: jest.fn(),
  createTickerRepository: jest.fn(),
  createHoldingRepository: jest.fn(),
  createAlertRepository: jest.fn(),
}));

const mockClearMemoryStore = clearMemoryStore as jest.Mock;
const mockCreateExchangeRepository = createExchangeRepository as jest.Mock;
const mockCreateTickerRepository = createTickerRepository as jest.Mock;
const mockCreateHoldingRepository = createHoldingRepository as jest.Mock;
const mockCreateAlertRepository = createAlertRepository as jest.Mock;

const createRequest = (contentLength: string = '0', body?: unknown): Request =>
  ({
    headers: { get: (name: string) => (name === 'content-length' ? contentLength : null) },
    json: async () => body,
  }) as unknown as Request;

describe('POST /api/test/reset', () => {
  const originalEnv = process.env;
  const mockExchangeCreate = jest.fn();
  const mockTickerCreate = jest.fn();
  const mockHoldingCreate = jest.fn();
  const mockAlertCreate = jest.fn();

  beforeEach(() => {
    process.env = { ...originalEnv, USE_IN_MEMORY_DB: 'true' };
    jest.resetAllMocks();
    mockCreateExchangeRepository.mockReturnValue({ create: mockExchangeCreate });
    mockCreateTickerRepository.mockReturnValue({ create: mockTickerCreate });
    mockCreateHoldingRepository.mockReturnValue({ create: mockHoldingCreate });
    mockCreateAlertRepository.mockReturnValue({ create: mockAlertCreate });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('USE_IN_MEMORY_DB !== "true" の場合は 404 を { error, message } 形式で返す', async () => {
    process.env.USE_IN_MEMORY_DB = 'false';

    const response = await POST(createRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'NOT_FOUND',
      message: '対象のデータが見つかりません',
    });
    expect(mockClearMemoryStore).not.toHaveBeenCalled();
  });

  it('本文なしの場合はリセットのみ行い success: true を返す', async () => {
    const response = await POST(createRequest());

    expect(mockClearMemoryStore).toHaveBeenCalled();
    expect(mockExchangeCreate).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { success: true } });
  });

  it('seed データを投入できる', async () => {
    const seed = {
      exchanges: [
        {
          ExchangeID: 'TEST-EX',
          Name: 'Test Exchange',
          Key: 'TEST',
          Timezone: 'America/New_York',
          Start: '09:30',
          End: '16:00',
          PriceSource: 'tradingview',
        },
      ],
      tickers: [{ TickerID: 'TEST-EX:AAPL', Symbol: 'AAPL', Name: 'Apple', ExchangeID: 'TEST-EX' }],
    };

    const response = await POST(createRequest('100', seed));

    expect(mockClearMemoryStore).toHaveBeenCalled();
    expect(mockExchangeCreate).toHaveBeenCalledWith(seed.exchanges[0]);
    expect(mockTickerCreate).toHaveBeenCalledWith(seed.tickers[0]);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { success: true } });
  });

  it('例外発生時は 500 を { error, message } 形式で返す', async () => {
    mockClearMemoryStore.mockImplementation(() => {
      throw new Error('予期しないエラー');
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'テスト用データのリセットに失敗しました',
    });
  });
});

describe('DELETE /api/test/reset', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, USE_IN_MEMORY_DB: 'true' };
    jest.resetAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('USE_IN_MEMORY_DB !== "true" の場合は 404 を { error, message } 形式で返す', async () => {
    process.env.USE_IN_MEMORY_DB = 'false';

    const response = await DELETE();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'NOT_FOUND',
      message: '対象のデータが見つかりません',
    });
    expect(mockClearMemoryStore).not.toHaveBeenCalled();
  });

  it('リセットに成功した場合は success: true を返す', async () => {
    const response = await DELETE();

    expect(mockClearMemoryStore).toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { success: true } });
  });

  it('例外発生時は 500 を { error, message } 形式で返す', async () => {
    mockClearMemoryStore.mockImplementation(() => {
      throw new Error('予期しないエラー');
    });

    const response = await DELETE();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'テスト用データのリセットに失敗しました',
    });
  });
});
