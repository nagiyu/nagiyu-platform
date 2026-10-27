import { NextRequest } from 'next/server';
import { GET, POST } from '../../../../app/api/tickers/route';
import {
  createExchangeRepository,
  createTickerRepository,
} from '../../../../lib/repository-factory';
import { EntityAlreadyExistsError } from '@nagiyu/aws';
import { MALFORMED_BODY_CASES } from './invalidBodyCases';

jest.mock('../../../../lib/repository-factory', () => ({
  createTickerRepository: jest.fn(),
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

function buildTicker(tickerId: string, exchangeId: string) {
  return {
    tickerId,
    symbol: tickerId,
    name: tickerId,
    exchangeId,
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
  };
}

describe('GET /api/tickers', () => {
  const mockGetByExchange = jest.fn();
  const mockGetAll = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (createTickerRepository as jest.Mock).mockReturnValue({
      getByExchange: mockGetByExchange,
      getAll: mockGetAll,
    });
  });

  it('exchangeId指定時、51件以上でもページネーションせず全件返す（Issue #3788）', async () => {
    const total = 51;
    const tickers = Array.from({ length: total }, (_, i) =>
      buildTicker(`NSDQ:T${String(i).padStart(4, '0')}`, 'NASDAQ')
    );
    mockGetByExchange.mockResolvedValue(tickers);

    const request = new NextRequest('http://localhost/api/tickers?exchangeId=NASDAQ');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tickers).toHaveLength(total);
    expect(body.pagination).toBeUndefined();
    expect(mockGetByExchange).toHaveBeenCalledWith('NASDAQ');
  });

  it('exchangeId未指定時、getAllの全件を返す', async () => {
    const total = 51;
    const tickers = Array.from({ length: total }, (_, i) =>
      buildTicker(`NSDQ:T${String(i).padStart(4, '0')}`, 'NASDAQ')
    );
    mockGetAll.mockResolvedValue({ items: tickers, nextCursor: undefined, count: total });

    const request = new NextRequest('http://localhost/api/tickers');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tickers).toHaveLength(total);
    expect(body.pagination).toBeUndefined();
    expect(mockGetAll).toHaveBeenCalledWith();
  });

  it('レスポンスのティッカーが期待する形式に変換される', async () => {
    mockGetByExchange.mockResolvedValue([buildTicker('NSDQ:AAPL', 'NASDAQ')]);

    const request = new NextRequest('http://localhost/api/tickers?exchangeId=NASDAQ');
    const response = await GET(request);
    const body = await response.json();

    expect(body.tickers).toEqual([
      { tickerId: 'NSDQ:AAPL', symbol: 'NSDQ:AAPL', name: 'NSDQ:AAPL', exchangeId: 'NASDAQ' },
    ]);
  });
});

describe('POST /api/tickers', () => {
  const mockExchangeGetById = jest.fn();
  const mockCreate = jest.fn();

  const validBody = { symbol: 'AAPL', name: 'Apple Inc.', exchangeId: 'NASDAQ' };

  const createRequest = (rawBody: string) =>
    new NextRequest('http://localhost/api/tickers', {
      method: 'POST',
      body: rawBody,
      headers: { 'content-type': 'application/json' },
    });

  beforeEach(() => {
    jest.clearAllMocks();
    (createExchangeRepository as jest.Mock).mockReturnValue({ getById: mockExchangeGetById });
    (createTickerRepository as jest.Mock).mockReturnValue({ create: mockCreate });
  });

  it('正しいボディでティッカーを作成する', async () => {
    mockExchangeGetById.mockResolvedValue({ key: 'NSDQ' });
    mockCreate.mockResolvedValue({
      tickerId: 'NSDQ:AAPL',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      exchangeId: 'NASDAQ',
      createdAt: 1704067200000,
    });

    const response = await POST(createRequest(JSON.stringify(validBody)));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.tickerId).toBe('NSDQ:AAPL');
    expect(mockCreate).toHaveBeenCalledWith({
      tickerId: 'NSDQ:AAPL',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      exchangeId: 'NASDAQ',
    });
  });

  it('同じティッカーが既に存在する場合は 400 を返す', async () => {
    mockExchangeGetById.mockResolvedValue({ key: 'NSDQ' });
    mockCreate.mockRejectedValue(new EntityAlreadyExistsError('Ticker', 'NSDQ:AAPL'));

    const response = await POST(createRequest(JSON.stringify(validBody)));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_REQUEST');
    expect(body.message).toBe('ティッカーは既に存在します');
  });

  it('取引所が存在しない場合は 400 を返し、ティッカーを作成しない', async () => {
    mockExchangeGetById.mockResolvedValue(null);

    const response = await POST(createRequest(JSON.stringify(validBody)));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('取引所が見つかりません');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('必須項目が欠けている場合はバリデーションの指摘を 400 で返す', async () => {
    const response = await POST(createRequest(JSON.stringify({ ...validBody, symbol: undefined })));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_REQUEST');
    expect(body.message).toBe('シンボルは必須です');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([
    ...MALFORMED_BODY_CASES,
    ['symbol が数値', JSON.stringify({ ...validBody, symbol: 1 })],
    ['name が数値', JSON.stringify({ ...validBody, name: 1 })],
    ['exchangeId が配列', JSON.stringify({ ...validBody, exchangeId: ['NASDAQ'] })],
  ])('異常系: %s の場合は 400 を返し、下流を呼ばない', async (_label, rawBody) => {
    const response = await POST(createRequest(rawBody));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('INVALID_REQUEST');
    expect(mockExchangeGetById).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('壊れた JSON の場合は専用のメッセージを返す', async () => {
    const response = await POST(createRequest('{"symbol":'));

    expect((await response.json()).message).toBe('リクエストボディが不正です');
  });
});
