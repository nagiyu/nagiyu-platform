import { NextRequest } from 'next/server';
import { GET } from '../../../../app/api/alerts/route';
import { createAlertRepository, createTickerRepository } from '../../../../lib/repository-factory';

jest.mock('../../../../lib/repository-factory', () => ({
  createAlertRepository: jest.fn(),
  createTickerRepository: jest.fn(),
  createExchangeRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { userId: 'test-user' } }, ...args);
  }),
  parsePagination: jest.fn(() => ({ limit: 50, cursor: undefined })),
  handleApiError: jest.fn((error) => {
    throw error;
  }),
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

  it('Web 一覧取得時に enabledOnly フィルタを付けずにリポジトリを呼ぶ', async () => {
    await GET(new NextRequest('http://localhost/api/alerts'));

    expect(mockGetByUserId).toHaveBeenCalledTimes(1);
    const [, options] = mockGetByUserId.mock.calls[0];
    expect(options).not.toHaveProperty('enabledOnly');
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
});
