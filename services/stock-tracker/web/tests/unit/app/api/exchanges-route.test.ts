import { GET, POST } from '../../../../app/api/exchanges/route';
import { GET as GET_BY_ID, PUT } from '../../../../app/api/exchanges/[id]/route';
import { createExchangeRepository } from '../../../../lib/repository-factory';
import * as awsModule from '@nagiyu/aws';

jest.mock('../../../../lib/repository-factory', () => ({
  createExchangeRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { userId: 'test-user' } }, ...args);
  }),
  handleApiError: jest.fn((error) => {
    throw error;
  }),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

describe('GET /api/exchanges', () => {
  const mockGetAll = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (createExchangeRepository as jest.Mock).mockReturnValue({ getAll: mockGetAll });
  });

  it('取引所一覧を正常に返す', async () => {
    mockGetAll.mockResolvedValue([
      {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '09:00',
        End: '17:00',
        PriceSource: 'tradingview',
        CreatedAt: 1,
        UpdatedAt: 1,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exchanges).toHaveLength(1);
    expect(body.exchanges[0].exchangeId).toBe('NASDAQ');
  });

  it('GET レスポンスに priceSource が含まれる', async () => {
    mockGetAll.mockResolvedValue([
      {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '09:00',
        End: '17:00',
        PriceSource: 'finnhub',
        CreatedAt: 1,
        UpdatedAt: 1,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exchanges[0].priceSource).toBe('finnhub');
  });

  it('DynamoDB エラー時に reportErrorEvent が呼ばれる', async () => {
    mockGetAll.mockRejectedValue(new Error('DynamoDB 接続エラー'));

    await expect(GET()).rejects.toThrow('DynamoDB 接続エラー');
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'stock-tracker', severity: 'error' })
    );
  });
});

describe('POST /api/exchanges', () => {
  const mockCreate = jest.fn();

  const validBody = {
    exchangeId: 'TSE',
    name: '東京証券取引所',
    key: 'TSE',
    timezone: 'Asia/Tokyo',
    tradingHours: { start: '09:00', end: '15:30' },
  };

  const createRequest = (body: Record<string, unknown>) =>
    new Request('http://localhost/api/exchanges', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });

  beforeEach(() => {
    jest.clearAllMocks();
    (createExchangeRepository as jest.Mock).mockReturnValue({ create: mockCreate });
  });

  it('priceSource 未指定時はデフォルト値 tradingview が使用される', async () => {
    mockCreate.mockResolvedValue({
      ExchangeID: 'TSE',
      Name: '東京証券取引所',
      Key: 'TSE',
      Timezone: 'Asia/Tokyo',
      Start: '09:00',
      End: '15:30',
      PriceSource: 'tradingview',
      CreatedAt: 1,
      UpdatedAt: 1,
    });

    // withAuth モックが先頭に session を挿入するため、エクスポート関数には request のみ渡す
    const response = await POST(createRequest(validBody) as never);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.priceSource).toBe('tradingview');
    // create が PriceSource: 'tradingview' で呼ばれていることを確認
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ PriceSource: 'tradingview' })
    );
  });

  it('priceSource に finnhub を指定すると反映される', async () => {
    mockCreate.mockResolvedValue({
      ExchangeID: 'NASDAQ',
      Name: 'NASDAQ Stock Market',
      Key: 'NSDQ',
      Timezone: 'America/New_York',
      Start: '04:00',
      End: '20:00',
      PriceSource: 'finnhub',
      CreatedAt: 1,
      UpdatedAt: 1,
    });

    const response = await POST(
      createRequest({
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        tradingHours: { start: '04:00', end: '20:00' },
        priceSource: 'finnhub',
      }) as never
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.priceSource).toBe('finnhub');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ PriceSource: 'finnhub' }));
  });

  it('不正な priceSource を指定すると 400 を返す', async () => {
    const response = await POST(
      createRequest({ ...validBody, priceSource: 'invalid-source' }) as never
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('DynamoDB エラー時に reportErrorEvent が呼ばれる', async () => {
    mockCreate.mockRejectedValue(new Error('DynamoDB 書き込みエラー'));

    await expect(POST(createRequest(validBody) as never)).rejects.toThrow();
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'stock-tracker', severity: 'error' })
    );
  });
});

describe('PUT /api/exchanges/:id', () => {
  const mockGetById = jest.fn();
  const mockUpdate = jest.fn();

  const existingExchange = {
    ExchangeID: 'TSE',
    Name: '東京証券取引所',
    Key: 'TSE',
    Timezone: 'Asia/Tokyo',
    Start: '09:00',
    End: '15:30',
    PriceSource: 'tradingview' as const,
    CreatedAt: 1,
    UpdatedAt: 1,
  };

  const createPutRequest = (id: string, body: Record<string, unknown>) =>
    new Request(`http://localhost/api/exchanges/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });

  const createParams = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeEach(() => {
    jest.clearAllMocks();
    (createExchangeRepository as jest.Mock).mockReturnValue({
      getById: mockGetById,
      update: mockUpdate,
    });
    mockGetById.mockResolvedValue(existingExchange);
  });

  it('priceSource を tradingview から finnhub に更新できる', async () => {
    mockUpdate.mockResolvedValue({
      ...existingExchange,
      PriceSource: 'finnhub',
      UpdatedAt: 2,
    });

    // withAuth モックが先頭に session を挿入するため、エクスポート関数には (request, paramsObj) の 2 引数で渡す
    const response = await PUT(
      createPutRequest('TSE', { priceSource: 'finnhub' }) as never,
      createParams('TSE') as never
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.priceSource).toBe('finnhub');
    expect(mockUpdate).toHaveBeenCalledWith(
      'TSE',
      expect.objectContaining({ PriceSource: 'finnhub' })
    );
  });

  it('不正な priceSource を指定すると 400 を返す', async () => {
    const response = await PUT(
      createPutRequest('TSE', { priceSource: 'invalid' }) as never,
      createParams('TSE') as never
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('GET レスポンスに priceSource が含まれる', async () => {
    // withAuth モックが先頭に session を挿入するため、エクスポート関数には (request, paramsObj) の 2 引数で渡す
    const response = await GET_BY_ID(undefined as never, createParams('TSE') as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.priceSource).toBe('tradingview');
  });
});
