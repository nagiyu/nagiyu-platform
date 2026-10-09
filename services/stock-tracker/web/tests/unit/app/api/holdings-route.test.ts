import { NextRequest } from 'next/server';
import { GET } from '../../../../app/api/holdings/route';
import {
  createHoldingRepository,
  createTickerRepository,
} from '../../../../lib/repository-factory';

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
    return async (...args: unknown[]) => handler({ user: { userId: 'test-user' } }, ...args);
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
          UserID: 'test-user',
          TickerID: 'NASDAQ:NVDA',
          Quantity: 5,
          AveragePrice: 98,
          Currency: 'USD',
          CreatedAt: 1,
          UpdatedAt: 2,
        },
      ],
      nextCursor: 'next-cursor',
    });
    mockGetTickerById.mockResolvedValue({ Symbol: 'NVDA', Name: 'NVIDIA' });

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
