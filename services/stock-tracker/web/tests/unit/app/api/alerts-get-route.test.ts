import { NextRequest } from 'next/server';
import { GET } from '../../../../app/api/alerts/route';
import { createAlertRepository, createTickerRepository } from '../../../../lib/repository-factory';
import * as awsModule from '@nagiyu/aws';

jest.mock('../../../../lib/repository-factory', () => ({
  createAlertRepository: jest.fn(),
  createTickerRepository: jest.fn(),
  createExchangeRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

// ページネーションの検証とエラー変換は実物を使い、withAuth だけを差し替える
jest.mock('@nagiyu/nextjs', () => ({
  ...jest.requireActual('@nagiyu/nextjs'),
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { userId: 'test-user' } }, ...args);
  }),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

describe('GET /api/alerts', () => {
  const mockGetByUserId = jest.fn();
  const mockTickerGetById = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (createAlertRepository as jest.Mock).mockReturnValue({ getByUserId: mockGetByUserId });
    (createTickerRepository as jest.Mock).mockReturnValue({ getById: mockTickerGetById });
    mockGetByUserId.mockResolvedValue({ items: [] });
  });

  it('Web 一覧取得時にページネーション以外のフィルタを付けずにリポジトリを呼ぶ', async () => {
    await GET(new NextRequest('http://localhost/api/alerts'));

    expect(mockGetByUserId).toHaveBeenCalledTimes(1);
    const [, options] = mockGetByUserId.mock.calls[0];
    // 論理削除フィルタはリポジトリ側で常に適用されるため、ルート側は何も渡さない
    expect(Object.keys(options)).toEqual(expect.arrayContaining(['limit', 'cursor']));
    expect(options).not.toHaveProperty('enabledOnly');
  });

  it('クエリパラメータのlastKeyをそのままcursorとしてリポジトリへ渡す', async () => {
    await GET(new NextRequest('http://localhost/api/alerts?lastKey=abc123'));

    expect(mockGetByUserId).toHaveBeenCalledTimes(1);
    const [, options] = mockGetByUserId.mock.calls[0];
    expect(options.cursor).toBe('abc123');
  });

  it('limitクエリパラメータをリポジトリへ渡す', async () => {
    await GET(new NextRequest('http://localhost/api/alerts?limit=10'));

    const [, options] = mockGetByUserId.mock.calls[0];
    expect(options.limit).toBe(10);
  });

  it.each(['0', '101', 'abc'])(
    'limit=%s の場合は 400 を返しリポジトリを呼ばない',
    async (limit) => {
      const response = await GET(new NextRequest(`http://localhost/api/alerts?limit=${limit}`));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('limit は 1 から 100 の間で指定してください');
      expect(mockGetByUserId).not.toHaveBeenCalled();
    }
  );

  it('リポジトリが返した nextCursor を pagination.lastKey として返す', async () => {
    mockGetByUserId.mockResolvedValue({ items: [], nextCursor: 'next-cursor' });

    const response = await GET(new NextRequest('http://localhost/api/alerts'));
    const body = await response.json();

    expect(body.pagination).toEqual({ count: 0, lastKey: 'next-cursor' });
  });

  it('lastKeyクエリパラメータが無い場合はcursorがundefinedになる', async () => {
    await GET(new NextRequest('http://localhost/api/alerts'));

    expect(mockGetByUserId).toHaveBeenCalledTimes(1);
    const [, options] = mockGetByUserId.mock.calls[0];
    expect(options.cursor).toBeUndefined();
  });

  it('無効化済みアラートもレスポンスに含めて返す', async () => {
    mockGetByUserId.mockResolvedValue({
      items: [
        {
          AlertID: 'enabled-1',
          TickerID: 'NASDAQ:NVDA',
          Mode: 'Buy',
          Frequency: 'MINUTE_LEVEL',
          ConditionList: [{ field: 'price', operator: 'gte', value: 120 }],
          Enabled: true,
          CreatedAt: 1,
          UpdatedAt: 1,
        },
        {
          AlertID: 'disabled-1',
          TickerID: 'NASDAQ:AAPL',
          Mode: 'Sell',
          Frequency: 'MINUTE_LEVEL',
          ConditionList: [{ field: 'price', operator: 'lte', value: 100 }],
          Enabled: false,
          CreatedAt: 1,
          UpdatedAt: 1,
        },
      ],
    });
    mockTickerGetById.mockResolvedValue({ Symbol: 'X', Name: 'X' });

    const response = await GET(new NextRequest('http://localhost/api/alerts'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.alerts).toHaveLength(2);
    expect(body.alerts.map((a: { alertId: string; enabled: boolean }) => a.enabled)).toEqual([
      true,
      false,
    ]);
  });

  it('DynamoDB エラー時に reportErrorEvent が呼ばれる', async () => {
    mockGetByUserId.mockRejectedValue(new Error('DynamoDB 接続エラー'));

    const response = await GET(new NextRequest('http://localhost/api/alerts'));

    expect(response.status).toBe(500);
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'stock-tracker', severity: 'error' })
    );
  });
});
