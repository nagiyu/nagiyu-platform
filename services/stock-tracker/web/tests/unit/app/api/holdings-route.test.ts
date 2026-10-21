import { NextRequest } from 'next/server';
import * as awsModule from '@nagiyu/aws';
import { GET, POST } from '../../../../app/api/holdings/route';
import {
  createHoldingRepository,
  createTickerRepository,
} from '../../../../lib/repository-factory';
import { MALFORMED_BODY_CASES } from './invalidBodyCases';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../../lib/repository-factory', () => ({
  createHoldingRepository: jest.fn(),
  createTickerRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

// ページネーションの検証とエラー変換は実物を使い、withAuth だけを差し替える
jest.mock('@nagiyu/nextjs', () => ({
  ...jest.requireActual('@nagiyu/nextjs'),
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { id: 'test-user' } }, ...args);
  }),
}));

describe('GET /api/holdings', () => {
  const mockGetByUserId = jest.fn();
  const mockGetTickerById = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (createHoldingRepository as jest.Mock).mockReturnValue({ getByUserId: mockGetByUserId });
    (createTickerRepository as jest.Mock).mockReturnValue({ getById: mockGetTickerById });
    mockGetByUserId.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ティッカー情報の取得に失敗しても一覧を返し、その場で報告する', async () => {
    mockGetByUserId.mockResolvedValue({
      items: [
        {
          userId: 'test-user',
          tickerId: 'NSDQ:AAPL',
          quantity: 1,
          averagePrice: 100,
          currency: 'USD',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    mockGetTickerById.mockRejectedValue(new Error('ticker db error'));

    const response = await GET(new NextRequest('http://localhost/api/holdings'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.holdings[0]).toEqual(expect.objectContaining({ symbol: 'AAPL', name: '' }));
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'Web API: 保有株式一覧の銘柄情報取得エラー',
        message: 'ticker db error',
      })
    );
  });

  it('クエリ未指定の場合は limit=50 でリポジトリを呼ぶ', async () => {
    const response = await GET(new NextRequest('http://localhost/api/holdings'));

    expect(response.status).toBe(200);
    expect(mockGetByUserId).toHaveBeenCalledWith('test-user', {
      limit: 50,
      cursor: undefined,
    });
  });

  it('limit と lastKey をリポジトリへ渡す', async () => {
    await GET(new NextRequest('http://localhost/api/holdings?limit=10&lastKey=abc123'));

    expect(mockGetByUserId).toHaveBeenCalledWith('test-user', {
      limit: 10,
      cursor: 'abc123',
    });
  });

  it.each(['0', '101', 'abc'])(
    'limit=%s の場合は 400 を返しリポジトリを呼ばない',
    async (limit) => {
      const response = await GET(new NextRequest(`http://localhost/api/holdings?limit=${limit}`));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('limit は 1 から 100 の間で指定してください');
      expect(mockGetByUserId).not.toHaveBeenCalled();
    }
  );

  it('保有株式と nextCursor を pagination.lastKey として返す', async () => {
    mockGetByUserId.mockResolvedValue({
      items: [
        {
          userId: 'test-user',
          tickerId: 'NASDAQ:NVDA',
          quantity: 5,
          averagePrice: 98,
          currency: 'USD',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      nextCursor: 'next-cursor',
    });
    mockGetTickerById.mockResolvedValue({ symbol: 'NVDA', name: 'NVIDIA' });

    const response = await GET(new NextRequest('http://localhost/api/holdings'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.holdings).toHaveLength(1);
    expect(body.holdings[0].symbol).toBe('NVDA');
    expect(body.pagination).toEqual({ count: 1, lastKey: 'next-cursor' });
  });

  it('次ページが無い場合は pagination.lastKey を含めない', async () => {
    const response = await GET(new NextRequest('http://localhost/api/holdings'));
    const body = await response.json();

    expect(body.pagination).toEqual({ count: 0 });
  });
});

describe('POST /api/holdings', () => {
  const mockCreate = jest.fn();
  const mockGetTickerById = jest.fn();

  const validBody = {
    tickerId: 'NSDQ:AAPL',
    quantity: 10,
    averagePrice: 150.5,
    currency: 'USD',
  };

  const createRequest = (rawBody: string) =>
    new NextRequest('http://localhost/api/holdings', {
      method: 'POST',
      body: rawBody,
      headers: { 'content-type': 'application/json' },
    });

  beforeEach(() => {
    jest.clearAllMocks();
    (createHoldingRepository as jest.Mock).mockReturnValue({ create: mockCreate });
    (createTickerRepository as jest.Mock).mockReturnValue({ getById: mockGetTickerById });
  });

  it('取引所 ID をティッカー ID から補って保有株式を登録する', async () => {
    mockCreate.mockResolvedValue({
      userId: 'test-user',
      tickerId: 'NSDQ:AAPL',
      exchangeId: 'NSDQ',
      quantity: 10,
      averagePrice: 150.5,
      currency: 'USD',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    });
    mockGetTickerById.mockResolvedValue({ symbol: 'AAPL', name: 'Apple Inc.' });

    const response = await POST(
      createRequest(JSON.stringify({ ...validBody, userId: 'other-user' }))
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.holdingId).toBe('test-user#NSDQ:AAPL');
    expect(mockCreate).toHaveBeenCalledWith({
      userId: 'test-user',
      tickerId: 'NSDQ:AAPL',
      exchangeId: 'NSDQ',
      quantity: 10,
      averagePrice: 150.5,
      currency: 'USD',
    });
  });

  it('同じ銘柄が既に登録されている場合は 400 を返し、通報しない', async () => {
    mockCreate.mockRejectedValue(
      new awsModule.EntityAlreadyExistsError('Holding', 'test-user#NSDQ:AAPL')
    );

    const response = await POST(createRequest(JSON.stringify(validBody)));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_REQUEST');
    expect(body.message).toBe('指定された銘柄は既に保有株式として登録されています');
    expect(mockGetTickerById).not.toHaveBeenCalled();
    expect(awsModule.reportErrorEvent).not.toHaveBeenCalled();
  });

  it('必須項目が欠けている場合はバリデーションの指摘を 400 で返す', async () => {
    const response = await POST(
      createRequest(JSON.stringify({ ...validBody, currency: undefined }))
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('入力データが不正です');
    expect(body.details).toEqual(['通貨コードは必須です']);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([
    ...MALFORMED_BODY_CASES,
    ['tickerId が数値', JSON.stringify({ ...validBody, tickerId: 1 })],
    ['exchangeId が数値', JSON.stringify({ ...validBody, exchangeId: 1 })],
    ['quantity が文字列', JSON.stringify({ ...validBody, quantity: '10' })],
    ['averagePrice が文字列', JSON.stringify({ ...validBody, averagePrice: '150.5' })],
    ['currency が数値', JSON.stringify({ ...validBody, currency: 1 })],
  ])('異常系: %s の場合は 400 を返し、下流を呼ばない', async (_label, rawBody) => {
    const response = await POST(createRequest(rawBody));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('INVALID_REQUEST');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockGetTickerById).not.toHaveBeenCalled();
  });

  it('壊れた JSON の場合は専用のメッセージを返す', async () => {
    const response = await POST(createRequest('{"tickerId":'));

    expect((await response.json()).message).toBe('リクエストボディが不正です');
  });
});
