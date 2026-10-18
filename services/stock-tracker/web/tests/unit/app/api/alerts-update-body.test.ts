import { NextRequest } from 'next/server';
import { PUT } from '../../../../app/api/alerts/[id]/route';
import {
  createAlertRepository,
  createExchangeRepository,
  createTickerRepository,
} from '../../../../lib/repository-factory';
import { MALFORMED_BODY_CASES } from './invalidBodyCases';

jest.mock('../../../../lib/repository-factory', () => ({
  createAlertRepository: jest.fn(),
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

describe('PUT /api/alerts/[id] のリクエストボディ', () => {
  const rangeAlert = {
    alertId: '550e8400-e29b-41d4-a716-446655440000',
    userId: 'test-user',
    tickerId: 'NASDAQ:AAPL',
    exchangeId: 'NASDAQ',
    mode: 'Buy',
    frequency: 'MINUTE_LEVEL',
    enabled: true,
    logicalOperator: 'AND',
    conditionList: [
      { field: 'price', operator: 'gte', value: 90 },
      { field: 'price', operator: 'lte', value: 110 },
    ],
    subscription: {
      endpoint: 'https://example.com/endpoint',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    },
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
  };

  const mockGetById = jest.fn();
  const mockUpdate = jest.fn();
  const mockGetExchangeById = jest.fn();

  const createRawRequest = (rawBody: string) =>
    new NextRequest('http://localhost/api/alerts/alert-1', {
      method: 'PUT',
      body: rawBody,
      headers: { 'content-type': 'application/json' },
    });

  const createRequest = (body: Record<string, unknown>) => createRawRequest(JSON.stringify(body));

  const params = { params: Promise.resolve({ id: 'alert-1' }) };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetById.mockResolvedValue(rangeAlert);
    mockUpdate.mockResolvedValue(rangeAlert);
    (createAlertRepository as jest.Mock).mockReturnValue({
      getById: mockGetById,
      update: mockUpdate,
    });
    (createTickerRepository as jest.Mock).mockReturnValue({
      getById: jest.fn().mockResolvedValue({ symbol: 'AAPL', name: 'Apple Inc.' }),
    });
    (createExchangeRepository as jest.Mock).mockReturnValue({ getById: mockGetExchangeById });
  });

  it('条件を位置ごとに部分更新し、想定外の項目は取り込まない', async () => {
    const response = await PUT(
      createRequest({
        conditions: [null, { value: 120, extra: 'x', field: null }],
        enabled: false,
        customMessage: ' メモ ',
        userId: 'other-user',
        tickerId: 'OTHER:XXX',
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('test-user', 'alert-1', {
      conditionList: [
        { field: 'price', operator: 'gte', value: 90 },
        { field: 'price', operator: 'lte', value: 120 },
      ],
      enabled: false,
      customMessage: 'メモ',
    });
  });

  it('パーセンテージ指定を取り込み、false 指定ではクリアする', async () => {
    const response = await PUT(
      createRequest({
        conditions: [
          { value: 81, isPercentage: true, percentageValue: -10, basePrice: 90 },
          { value: 99, isPercentage: false },
        ],
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('test-user', 'alert-1', {
      conditionList: [
        {
          field: 'price',
          operator: 'gte',
          value: 81,
          isPercentage: true,
          percentageValue: -10,
          basePrice: 90,
        },
        { field: 'price', operator: 'lte', value: 99, isPercentage: false },
      ],
    });
  });

  it('logicalOperator を条件とあわせて更新できる', async () => {
    const response = await PUT(
      createRequest({ logicalOperator: 'OR', conditions: [{ value: 120 }, { value: 100 }] }),
      params
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('test-user', 'alert-1', {
      conditionList: [
        { field: 'price', operator: 'gte', value: 120 },
        { field: 'price', operator: 'lte', value: 100 },
      ],
      logicalOperator: 'OR',
    });
  });

  it.each([
    ...MALFORMED_BODY_CASES,
    ['conditions が文字列', JSON.stringify({ conditions: 'price' })],
    ['conditions がオブジェクト', JSON.stringify({ conditions: { value: 1 } })],
    ['conditions に数値が含まれる', JSON.stringify({ conditions: [1] })],
    ['conditions に文字列が含まれる', JSON.stringify({ conditions: ['x'] })],
    ['enabled が文字列', JSON.stringify({ enabled: 'false' })],
    ['enabled が null', JSON.stringify({ enabled: null })],
    ['temporary が文字列', JSON.stringify({ temporary: 'true' })],
    ['temporary が null', JSON.stringify({ temporary: null })],
    ['customMessage が数値', JSON.stringify({ customMessage: 1 })],
    ['customMessage が null', JSON.stringify({ customMessage: null })],
  ])('異常系: %s の場合は 400 を返し、下流を呼ばない', async (_label, rawBody) => {
    const response = await PUT(createRawRequest(rawBody), params);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'INVALID_REQUEST', message: 'リクエストボディが不正です' });
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockGetExchangeById).not.toHaveBeenCalled();
  });

  it.each([
    [
      '条件の field が不正な値',
      { conditions: [{ field: 'volume' }] },
      'Phase 1ではフィールドは"price"のみ指定できます',
    ],
    [
      '条件の operator が数値',
      { conditions: [{ operator: 1 }] },
      'Phase 1では演算子は"gte"または"lte"のみ指定できます',
    ],
    [
      '条件の value が文字列',
      { conditions: [{ value: '100' }] },
      '条件値は0.01〜1,000,000の範囲で入力してください',
    ],
    [
      'logicalOperator が不正な値',
      { logicalOperator: 'XOR' },
      '論理演算子は"AND"または"OR"を指定してください',
    ],
    [
      'logicalOperator が数値',
      { logicalOperator: 1 },
      '論理演算子は"AND"または"OR"を指定してください',
    ],
  ])(
    '入力データが不正（%s）な場合は検証の指摘つきで 400 を返し、下流を呼ばない',
    async (_label, override, detail) => {
      const response = await PUT(createRequest(override), params);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('INVALID_REQUEST');
      expect(body.message).toBe('入力データが不正です');
      expect(body.details).toEqual(expect.arrayContaining([detail]));
      expect(mockUpdate).not.toHaveBeenCalled();
    }
  );

  it('壊れた JSON の場合は専用のメッセージを返す', async () => {
    const response = await PUT(createRawRequest('{"enabled":'), params);

    expect((await response.json()).message).toBe('リクエストボディが不正です');
  });

  it('logicalOperator が null の場合は更新対象に含めない', async () => {
    const response = await PUT(createRequest({ logicalOperator: null, enabled: true }), params);

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('test-user', 'alert-1', { enabled: true });
  });
});
