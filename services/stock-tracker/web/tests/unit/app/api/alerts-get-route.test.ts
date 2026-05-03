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

  it('Web 一覧取得時に enabledOnly: true でリポジトリを呼ぶ', async () => {
    await GET(new NextRequest('http://localhost/api/alerts'));

    expect(mockGetByUserId).toHaveBeenCalledTimes(1);
    expect(mockGetByUserId).toHaveBeenCalledWith(
      'test-user',
      expect.objectContaining({ enabledOnly: true })
    );
  });
});
