/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/errors/route';
import { createErrorEventReader } from '@nagiyu/admin-core';
import { getSession } from '@/lib/auth/session';

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(),
  reportErrorEvent: jest.fn(async () => null),
}));

jest.mock(
  '@nagiyu/admin-core',
  () => ({
    createErrorEventReader: jest.fn(),
  }),
  { virtual: true }
);

jest.mock('@/lib/auth/session', () => ({
  getSession: jest.fn(),
}));

const mockCreateErrorEventReader = createErrorEventReader as jest.MockedFunction<
  typeof createErrorEventReader
>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;

describe('GET /api/errors', () => {
  const mockList = jest.fn();

  const createRequest = (query = ''): NextRequest =>
    new NextRequest(`http://localhost/api/errors${query}`);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_IN_MEMORY_DB = 'true';
    mockGetSession.mockResolvedValue({
      user: { id: 'test-user-id', email: 'admin@example.com', name: 'Admin', roles: ['admin'] },
      expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    } as Awaited<ReturnType<typeof getSession>>);
    mockList.mockResolvedValue({ items: [], nextCursor: null });
    mockCreateErrorEventReader.mockReturnValue({
      list: mockList,
    } as unknown as ReturnType<typeof createErrorEventReader>);
  });

  it('クエリ未指定の場合は limit=50 で一覧を取得する', async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith({ limit: 50 });
  });

  it('limit と lastKey を reader.list の limit と cursor へ渡す', async () => {
    await GET(createRequest('?limit=10&lastKey=abc123&serviceId=admin'));

    expect(mockList).toHaveBeenCalledWith({ limit: 10, cursor: 'abc123', serviceId: 'admin' });
  });

  it('items と pagination.lastKey を返す', async () => {
    const items = [{ eventId: 'evt-1' }, { eventId: 'evt-2' }];
    mockList.mockResolvedValue({ items, nextCursor: 'next-cursor' });

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items,
      pagination: { count: 2, lastKey: 'next-cursor' },
    });
  });

  it('nextCursor が null の場合は pagination.lastKey を含めない', async () => {
    mockList.mockResolvedValue({ items: [{ eventId: 'evt-1' }], nextCursor: null });

    const response = await GET(createRequest());

    expect(await response.json()).toEqual({
      items: [{ eventId: 'evt-1' }],
      pagination: { count: 1 },
    });
  });

  it.each(['0', '101', 'abc'])('limit=%s の場合は 400 を返し reader を呼ばない', async (limit) => {
    const response = await GET(createRequest(`?limit=${limit}`));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'INVALID_REQUEST',
      message: 'limit は 1 から 100 の間で指定してください',
    });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('reader が cursor 不正で例外を投げた場合は 400 を返す', async () => {
    mockList.mockRejectedValue(new Error('cursor が不正な形式です'));

    const response = await GET(createRequest('?lastKey=broken'));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('INVALID_REQUEST');
  });

  it('未ログインの場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof getSession>>);

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
  });
});
