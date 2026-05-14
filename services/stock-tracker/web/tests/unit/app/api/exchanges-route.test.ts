import { GET, POST } from '../../../../app/api/exchanges/route';
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

  it('DynamoDB エラー時に reportErrorEvent が呼ばれる', async () => {
    mockCreate.mockRejectedValue(new Error('DynamoDB 書き込みエラー'));

    await expect(POST(undefined as never, createRequest(validBody))).rejects.toThrow();
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'stock-tracker', severity: 'error' })
    );
  });
});
