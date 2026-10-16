import { NextRequest } from 'next/server';
import { POST } from '../../../../app/api/alerts/route';
import {
  createAlertRepository,
  createExchangeRepository,
  createTickerRepository,
} from '../../../../lib/repository-factory';
import * as awsModule from '@nagiyu/aws';
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
  validatePushSubscription: jest.requireActual('@nagiyu/nextjs').validatePushSubscription,
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { id: 'test-user' } }, ...args);
  }),
  parsePagination: jest.fn(),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

describe('POST /api/alerts のリクエストボディ', () => {
  const mockCreate = jest.fn();
  const mockGetTickerById = jest.fn();
  const mockGetExchangeById = jest.fn();

  const subscription = {
    endpoint: 'https://example.com/endpoint',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  };

  const validBody = {
    tickerId: 'NASDAQ:AAPL',
    mode: 'Buy',
    frequency: 'MINUTE_LEVEL',
    conditions: [{ field: 'price', operator: 'gte', value: 100 }],
    subscription,
  };

  const createRawRequest = (rawBody: string) =>
    new NextRequest('http://localhost/api/alerts', {
      method: 'POST',
      body: rawBody,
      headers: { 'content-type': 'application/json' },
    });

  const createRequest = (body: Record<string, unknown>) => createRawRequest(JSON.stringify(body));

  beforeEach(() => {
    jest.clearAllMocks();
    (createAlertRepository as jest.Mock).mockReturnValue({ create: mockCreate });
    (createTickerRepository as jest.Mock).mockReturnValue({ getById: mockGetTickerById });
    (createExchangeRepository as jest.Mock).mockReturnValue({ getById: mockGetExchangeById });
    mockCreate.mockImplementation(async (input: Record<string, unknown>) => ({
      ...input,
      AlertID: '550e8400-e29b-41d4-a716-446655440000',
      CreatedAt: 1704067200000,
      UpdatedAt: 1704067200000,
    }));
    mockGetTickerById.mockResolvedValue({ symbol: 'AAPL', name: 'Apple Inc.' });
  });

  it('取引所 ID をティッカー ID から補い、想定外の項目を取り込まずに作成する', async () => {
    const response = await POST(
      createRequest({
        ...validBody,
        userId: 'other-user',
        conditions: [
          { field: 'price', operator: 'gte', value: 100, isPercentage: null, extra: 'x' },
        ],
      })
    );

    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith({
      UserID: 'test-user',
      TickerID: 'NASDAQ:AAPL',
      ExchangeID: 'NASDAQ',
      Mode: 'Buy',
      Frequency: 'MINUTE_LEVEL',
      Enabled: true,
      ConditionList: [{ field: 'price', operator: 'gte', value: 100 }],
      LogicalOperator: undefined,
      Temporary: undefined,
      TemporaryExpireDate: undefined,
      CustomMessage: undefined,
      subscription,
    });
  });

  it('範囲指定の条件とパーセンテージ情報を取り込む', async () => {
    const response = await POST(
      createRequest({
        ...validBody,
        logicalOperator: 'AND',
        conditions: [
          {
            field: 'price',
            operator: 'gte',
            value: 90,
            isPercentage: true,
            percentageValue: -10,
            basePrice: 100,
          },
          { field: 'price', operator: 'lte', value: 110 },
        ],
      })
    );

    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        LogicalOperator: 'AND',
        ConditionList: [
          {
            field: 'price',
            operator: 'gte',
            value: 90,
            isPercentage: true,
            percentageValue: -10,
            basePrice: 100,
          },
          { field: 'price', operator: 'lte', value: 110 },
        ],
      })
    );
  });

  it.each([
    ...MALFORMED_BODY_CASES,
    ['tickerId が数値', JSON.stringify({ ...validBody, tickerId: 1 })],
    ['exchangeId が数値', JSON.stringify({ ...validBody, exchangeId: 1 })],
    ['conditions に null が含まれる', JSON.stringify({ ...validBody, conditions: [null] })],
    ['conditions に数値が含まれる', JSON.stringify({ ...validBody, conditions: [1] })],
    ['enabled が文字列', JSON.stringify({ ...validBody, enabled: 'true' })],
    ['enabled が null', JSON.stringify({ ...validBody, enabled: null })],
  ])('異常系: %s の場合は 400 を返し、下流を呼ばず通報もしない', async (_label, rawBody) => {
    const response = await POST(createRawRequest(rawBody));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'INVALID_REQUEST', message: 'リクエストボディが不正です' });
    expect(createAlertRepository).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(awsModule.reportErrorEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['mode が不正な値', { mode: 'Hold' }, 'モードは"Buy"または"Sell"を指定してください'],
    ['mode が数値', { mode: 1 }, 'モードは"Buy"または"Sell"を指定してください'],
    [
      'frequency が不正な値',
      { frequency: 'DAILY' },
      '通知頻度は"MINUTE_LEVEL"または"HOURLY_LEVEL"を指定してください',
    ],
    ['conditions が配列でない', { conditions: 'price' }, undefined],
    [
      '条件の field が不正な値',
      { conditions: [{ field: 'volume', operator: 'gte', value: 100 }] },
      'Phase 1ではフィールドは"price"のみ指定できます',
    ],
    [
      '条件の operator が不正な値',
      { conditions: [{ field: 'price', operator: 'eq', value: 100 }] },
      'Phase 1では演算子は"gte"または"lte"のみ指定できます',
    ],
    [
      '条件の value が文字列',
      { conditions: [{ field: 'price', operator: 'gte', value: '100' }] },
      '条件値は0.01〜1,000,000の範囲で入力してください',
    ],
    [
      '条件の value が null',
      { conditions: [{ field: 'price', operator: 'gte', value: null }] },
      '条件値は必須です',
    ],
    [
      '条件の isPercentage が文字列',
      { conditions: [{ field: 'price', operator: 'gte', value: 100, isPercentage: 'yes' }] },
      undefined,
    ],
    [
      'logicalOperator が不正な値',
      {
        logicalOperator: 'XOR',
        conditions: [
          { field: 'price', operator: 'gte', value: 90 },
          { field: 'price', operator: 'lte', value: 110 },
        ],
      },
      '論理演算子は"AND"または"OR"を指定してください',
    ],
    [
      '単一条件に logicalOperator が指定される',
      { logicalOperator: 'AND' },
      '単一条件の場合、論理演算子は設定できません',
    ],
  ])(
    '入力データが不正（%s）な場合は 400 を返し、下流を呼ばない',
    async (_label, override, expectedDetail) => {
      const response = await POST(createRequest({ ...validBody, ...override }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('INVALID_REQUEST');
      expect(body.message).toBe('入力データが不正です');
      if (expectedDetail !== undefined) {
        expect(body.details).toEqual(expect.arrayContaining([expectedDetail]));
      }
      expect(createAlertRepository).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
      expect(awsModule.reportErrorEvent).not.toHaveBeenCalled();
    }
  );

  it('壊れた JSON の場合は専用のメッセージを返す', async () => {
    const response = await POST(createRawRequest('{"tickerId":'));

    expect((await response.json()).message).toBe('リクエストボディが不正です');
  });
});
