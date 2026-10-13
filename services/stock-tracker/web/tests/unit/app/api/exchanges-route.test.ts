import { GET, POST } from '../../../../app/api/exchanges/route';
import { GET as GET_BY_ID, PUT, DELETE } from '../../../../app/api/exchanges/[id]/route';
import { createExchangeRepository } from '../../../../lib/repository-factory';
import * as awsModule from '@nagiyu/aws';
import { MALFORMED_BODY_CASES } from './invalidBodyCases';

jest.mock('../../../../lib/repository-factory', () => ({
  createExchangeRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  createApiErrorReporting: jest.requireActual('@nagiyu/nextjs').createApiErrorReporting,
  readJsonObjectBody: jest.requireActual('@nagiyu/nextjs').readJsonObjectBody,
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { id: 'test-user' } }, ...args);
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
        exchangeId: 'NASDAQ',
        name: 'NASDAQ',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '09:00',
        end: '17:00',
        priceSource: 'tradingview',
        createdAt: 1,
        updatedAt: 1,
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
        exchangeId: 'NASDAQ',
        name: 'NASDAQ',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '09:00',
        end: '17:00',
        priceSource: 'finnhub',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exchanges[0].priceSource).toBe('finnhub');
  });

  it('GET レスポンスに market が含まれる', async () => {
    mockGetAll.mockResolvedValue([
      {
        exchangeId: 'TSE',
        name: '東京証券取引所',
        key: 'TSE',
        timezone: 'Asia/Tokyo',
        start: '09:00',
        end: '15:30',
        priceSource: 'tradingview',
        market: 'JP',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exchanges[0].market).toBe('JP');
  });

  it('market が未設定の場合、GET レスポンスに market を含まない', async () => {
    mockGetAll.mockResolvedValue([
      {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '09:00',
        end: '17:00',
        priceSource: 'tradingview',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exchanges[0].market).toBeUndefined();
  });

  it('DynamoDB エラー時に reportErrorEvent が呼ばれる', async () => {
    mockGetAll.mockRejectedValue(new Error('DynamoDB 接続エラー'));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'Web API: 取引所一覧取得エラー',
        message: expect.stringContaining('DynamoDB'),
      })
    );
    expect(awsModule.reportErrorEvent).toHaveBeenCalledTimes(1);
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
      exchangeId: 'TSE',
      name: '東京証券取引所',
      key: 'TSE',
      timezone: 'Asia/Tokyo',
      start: '09:00',
      end: '15:30',
      priceSource: 'tradingview',
      createdAt: 1,
      updatedAt: 1,
    });

    // withAuth モックが先頭に session を挿入するため、エクスポート関数には request のみ渡す
    const response = await POST(createRequest(validBody) as never);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.priceSource).toBe('tradingview');
    // create が priceSource: 'tradingview' で呼ばれていることを確認
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ priceSource: 'tradingview' })
    );
  });

  it('priceSource に finnhub を指定すると反映される', async () => {
    mockCreate.mockResolvedValue({
      exchangeId: 'NASDAQ',
      name: 'NASDAQ Stock Market',
      key: 'NSDQ',
      timezone: 'America/New_York',
      start: '04:00',
      end: '20:00',
      priceSource: 'finnhub',
      createdAt: 1,
      updatedAt: 1,
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
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ priceSource: 'finnhub' }));
  });

  it('不正な priceSource を指定すると 400 を返す', async () => {
    const response = await POST(
      createRequest({ ...validBody, priceSource: 'invalid-source' }) as never
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('market 未指定時は未設定のまま作成される', async () => {
    mockCreate.mockResolvedValue({
      exchangeId: 'TSE',
      name: '東京証券取引所',
      key: 'TSE',
      timezone: 'Asia/Tokyo',
      start: '09:00',
      end: '15:30',
      priceSource: 'tradingview',
      createdAt: 1,
      updatedAt: 1,
    });

    const response = await POST(createRequest(validBody) as never);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.market).toBeUndefined();
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ market: undefined }));
  });

  it('market に JP を指定すると反映される', async () => {
    mockCreate.mockResolvedValue({
      exchangeId: 'TSE',
      name: '東京証券取引所',
      key: 'TSE',
      timezone: 'Asia/Tokyo',
      start: '09:00',
      end: '15:30',
      priceSource: 'tradingview',
      market: 'JP',
      createdAt: 1,
      updatedAt: 1,
    });

    const response = await POST(createRequest({ ...validBody, market: 'JP' }) as never);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.market).toBe('JP');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ market: 'JP' }));
  });

  it('不正な market を指定すると 400 を返す', async () => {
    const response = await POST(createRequest({ ...validBody, market: 'EU' }) as never);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('INVALID_REQUEST');
    expect(body.message).toBe('市場は "JP" または "US" のいずれかを指定してください');
  });

  it('同じ取引所IDが既に存在する場合は 400 を返し、通報しない', async () => {
    mockCreate.mockRejectedValue(new awsModule.EntityAlreadyExistsError('Exchange', 'TSE'));

    const response = await POST(createRequest(validBody) as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_REQUEST');
    expect(body.message).toBe('取引所は既に存在します');
    expect(awsModule.reportErrorEvent).not.toHaveBeenCalled();
  });

  it('DynamoDB エラー時に reportErrorEvent が呼ばれる', async () => {
    mockCreate.mockRejectedValue(new Error('DynamoDB 書き込みエラー'));

    const response = await POST(createRequest(validBody) as never);

    expect(response.status).toBe(500);
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'Web API: 取引所作成エラー',
        message: expect.stringContaining('DynamoDB'),
      })
    );
    expect(awsModule.reportErrorEvent).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /api/exchanges/:id', () => {
  const mockGetById = jest.fn();
  const mockUpdate = jest.fn();

  const existingExchange = {
    exchangeId: 'TSE',
    name: '東京証券取引所',
    key: 'TSE',
    timezone: 'Asia/Tokyo',
    start: '09:00',
    end: '15:30',
    priceSource: 'tradingview' as const,
    createdAt: 1,
    updatedAt: 1,
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
      priceSource: 'finnhub',
      updatedAt: 2,
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
      expect.objectContaining({ priceSource: 'finnhub' })
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

  it('未設定の market を JP に更新できる', async () => {
    mockUpdate.mockResolvedValue({
      ...existingExchange,
      market: 'JP',
      updatedAt: 2,
    });

    const response = await PUT(
      createPutRequest('TSE', { market: 'JP' }) as never,
      createParams('TSE') as never
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.market).toBe('JP');
    expect(mockUpdate).toHaveBeenCalledWith('TSE', expect.objectContaining({ market: 'JP' }));
  });

  it('market に null を指定すると未設定に戻る（DynamoDBの属性削除相当）', async () => {
    mockGetById.mockResolvedValue({ ...existingExchange, market: 'JP' });
    mockUpdate.mockResolvedValue({
      ...existingExchange,
      market: undefined,
      updatedAt: 2,
    });

    const response = await PUT(
      createPutRequest('TSE', { market: null }) as never,
      createParams('TSE') as never
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.market).toBeUndefined();
    expect(mockUpdate).toHaveBeenCalledWith('TSE', expect.objectContaining({ market: null }));
  });

  it('market を指定しない更新では Market が更新対象に含まれない', async () => {
    mockUpdate.mockResolvedValue({
      ...existingExchange,
      name: '東証改称',
      updatedAt: 2,
    });

    await PUT(createPutRequest('TSE', { name: '東証改称' }) as never, createParams('TSE') as never);

    const updateArg = mockUpdate.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(updateArg).not.toHaveProperty('Market');
  });

  it('不正な market を指定すると 400 を返す', async () => {
    const response = await PUT(
      createPutRequest('TSE', { market: 'EU' }) as never,
      createParams('TSE') as never
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('INVALID_REQUEST');
    expect(body.message).toBe('市場は "JP" または "US" のいずれかを指定してください');
  });
});

describe('DELETE /api/exchanges/:id', () => {
  const mockDelete = jest.fn();

  const createParams = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeEach(() => {
    jest.clearAllMocks();
    (createExchangeRepository as jest.Mock).mockReturnValue({ delete: mockDelete });
  });

  it('取引所を削除できる', async () => {
    mockDelete.mockResolvedValue(undefined);

    const response = await DELETE(undefined as never, createParams('TSE') as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, deletedExchangeId: 'TSE' });
    expect(mockDelete).toHaveBeenCalledWith('TSE');
  });

  it('対象の取引所が存在しない場合は 404 を返し、通報しない', async () => {
    mockDelete.mockRejectedValue(new awsModule.EntityNotFoundError('Exchange', 'NOTFOUND'));

    const response = await DELETE(undefined as never, createParams('NOTFOUND') as never);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('NOT_FOUND');
    expect(body.message).toBe('取引所が見つかりません');
    expect(awsModule.reportErrorEvent).not.toHaveBeenCalled();
  });

  it('DynamoDB エラー時に reportErrorEvent が呼ばれる', async () => {
    mockDelete.mockRejectedValue(new Error('DynamoDB 削除エラー'));

    const response = await DELETE(undefined as never, createParams('TSE') as never);

    expect(response.status).toBe(500);
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'Web API: 取引所削除エラー',
        message: expect.stringContaining('DynamoDB'),
      })
    );
    expect(awsModule.reportErrorEvent).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/exchanges のリクエストボディ検証', () => {
  const mockCreate = jest.fn();

  const validBody = {
    exchangeId: 'TSE',
    name: '東京証券取引所',
    key: 'TSE',
    timezone: 'Asia/Tokyo',
    tradingHours: { start: '09:00', end: '15:30' },
  };

  const createRawRequest = (rawBody: string) =>
    new Request('http://localhost/api/exchanges', {
      method: 'POST',
      body: rawBody,
      headers: { 'content-type': 'application/json' },
    });

  beforeEach(() => {
    jest.clearAllMocks();
    (createExchangeRepository as jest.Mock).mockReturnValue({ create: mockCreate });
  });

  it.each([
    ...MALFORMED_BODY_CASES,
    ['exchangeId が数値', JSON.stringify({ ...validBody, exchangeId: 1 })],
    ['name が数値', JSON.stringify({ ...validBody, name: 1 })],
    ['key が配列', JSON.stringify({ ...validBody, key: ['TSE'] })],
    ['timezone が真偽値', JSON.stringify({ ...validBody, timezone: true })],
    ['tradingHours が文字列', JSON.stringify({ ...validBody, tradingHours: '09:00-15:30' })],
    ['tradingHours が null', JSON.stringify({ ...validBody, tradingHours: null })],
    ['tradingHours が配列', JSON.stringify({ ...validBody, tradingHours: [] })],
    [
      'tradingHours.start が数値',
      JSON.stringify({ ...validBody, tradingHours: { start: 900, end: '15:30' } }),
    ],
    [
      'tradingHours.end が数値',
      JSON.stringify({ ...validBody, tradingHours: { start: '09:00', end: 1530 } }),
    ],
    ['priceSource が数値', JSON.stringify({ ...validBody, priceSource: 1 })],
    ['market が null', JSON.stringify({ ...validBody, market: null })],
  ])('異常系: %s の場合は 400 を返し、下流を呼ばず通報もしない', async (_label, rawBody) => {
    const response = await POST(createRawRequest(rawBody) as never);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('INVALID_REQUEST');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(awsModule.reportErrorEvent).not.toHaveBeenCalled();
  });

  it('壊れた JSON の場合は専用のメッセージを返す', async () => {
    const response = await POST(createRawRequest('{"exchangeId":') as never);

    expect((await response.json()).message).toBe('リクエストボディが不正です');
  });

  it('必須項目が欠けている場合はバリデーションの指摘を 400 で返す', async () => {
    const response = await POST(
      createRawRequest(JSON.stringify({ ...validBody, name: undefined })) as never
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('取引所名は必須です');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('tradingHours が未指定の場合は開始時刻の不足を 400 で返す', async () => {
    const response = await POST(
      createRawRequest(JSON.stringify({ ...validBody, tradingHours: undefined })) as never
    );

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('PUT /api/exchanges/:id のリクエストボディ検証', () => {
  const mockGetById = jest.fn();
  const mockUpdate = jest.fn();

  const existingExchange = {
    exchangeId: 'TSE',
    name: '東京証券取引所',
    key: 'TSE',
    timezone: 'Asia/Tokyo',
    start: '09:00',
    end: '15:30',
    priceSource: 'tradingview' as const,
    createdAt: 1,
    updatedAt: 1,
  };

  const createRawRequest = (rawBody: string) =>
    new Request('http://localhost/api/exchanges/TSE', {
      method: 'PUT',
      body: rawBody,
      headers: { 'content-type': 'application/json' },
    });

  const params = { params: Promise.resolve({ id: 'TSE' }) };

  beforeEach(() => {
    jest.clearAllMocks();
    (createExchangeRepository as jest.Mock).mockReturnValue({
      getById: mockGetById,
      update: mockUpdate,
    });
    mockGetById.mockResolvedValue(existingExchange);
  });

  it('更新対象の項目だけをリポジトリへ渡す', async () => {
    mockUpdate.mockResolvedValue({ ...existingExchange, name: '東証', updatedAt: 2 });

    const response = await PUT(
      createRawRequest(
        JSON.stringify({
          name: '東証',
          tradingHours: { start: '09:30' },
          exchangeId: 'OTHER',
          key: 'OTHER',
        })
      ) as never,
      params as never
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('TSE', { name: '東証', start: '09:30' });
  });

  it.each([
    ...MALFORMED_BODY_CASES,
    ['name が数値', JSON.stringify({ name: 1 })],
    ['timezone が真偽値', JSON.stringify({ timezone: true })],
    ['tradingHours が文字列', JSON.stringify({ tradingHours: '09:00-15:30' })],
    ['tradingHours が null', JSON.stringify({ tradingHours: null })],
    ['tradingHours が配列', JSON.stringify({ tradingHours: [] })],
    ['tradingHours.start が数値', JSON.stringify({ tradingHours: { start: 900 } })],
    ['tradingHours.end が null', JSON.stringify({ tradingHours: { end: null } })],
    ['priceSource が数値', JSON.stringify({ priceSource: 1 })],
    ['market が数値', JSON.stringify({ market: 1 })],
  ])('異常系: %s の場合は 400 を返し、下流を呼ばず通報もしない', async (_label, rawBody) => {
    const response = await PUT(createRawRequest(rawBody) as never, params as never);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('INVALID_REQUEST');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(awsModule.reportErrorEvent).not.toHaveBeenCalled();
  });

  it('壊れた JSON の場合は専用のメッセージを返す', async () => {
    const response = await PUT(createRawRequest('{"name":') as never, params as never);

    expect((await response.json()).message).toBe('リクエストボディが不正です');
  });
});
