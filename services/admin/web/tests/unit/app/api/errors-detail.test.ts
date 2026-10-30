/**
 * @jest-environment node
 */
import { GET } from '@/app/api/errors/[eventId]/route';
import { createErrorEventReader } from '@nagiyu/admin-core';
import { getSession } from '@/lib/auth/session';

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(),
  reportErrorEvent: jest.fn(async () => null),
  createErrorReporter: jest.fn(() => ({ report: jest.fn(), onError: jest.fn(() => jest.fn()) })),
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

const OCCURRED_AT = Date.parse('2026-05-06T01:00:00.000Z');

describe('GET /api/errors/{eventId}', () => {
  const mockFindById = jest.fn();

  const call = (query: string) =>
    GET(new Request(`http://localhost/api/errors/evt-1${query}`), {
      params: Promise.resolve({ eventId: 'evt-1' }),
    });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_IN_MEMORY_DB = 'true';
    mockGetSession.mockResolvedValue({
      user: { id: 'test-user-id', email: 'admin@example.com', name: 'Admin', roles: ['admin'] },
      expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    } as Awaited<ReturnType<typeof getSession>>);
    mockFindById.mockResolvedValue(null);
    mockCreateErrorEventReader.mockReturnValue({
      findById: mockFindById,
    } as unknown as ReturnType<typeof createErrorEventReader>);
  });

  it('at が epoch ミリ秒なら数値のまま reader.findById へ渡し、数値の occurredAt を返す', async () => {
    mockFindById.mockResolvedValue({ eventId: 'evt-1', occurredAt: OCCURRED_AT });

    const response = await call(`?at=${OCCURRED_AT}&serviceId=admin`);

    expect(response.status).toBe(200);
    expect(mockFindById).toHaveBeenCalledWith('evt-1', OCCURRED_AT, 'admin');
    await expect(response.json()).resolves.toEqual({ eventId: 'evt-1', occurredAt: OCCURRED_AT });
  });

  it('at が ISO 文字列の旧リンクもミリ秒に変換して検索する', async () => {
    await call('?at=2026-05-06T01:00:00.000Z&serviceId=admin');

    expect(mockFindById).toHaveBeenCalledWith('evt-1', OCCURRED_AT, 'admin');
  });

  it('at が解釈できない場合は 400', async () => {
    const response = await call('?at=not-a-date&serviceId=admin');

    expect(response.status).toBe(400);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('at が無い場合は 400', async () => {
    expect((await call('?serviceId=admin')).status).toBe(400);
  });

  it('serviceId が無い場合は 400', async () => {
    expect((await call(`?at=${OCCURRED_AT}`)).status).toBe(400);
  });

  it('該当が無い場合は 404', async () => {
    expect((await call(`?at=${OCCURRED_AT}&serviceId=admin`)).status).toBe(404);
  });
});
