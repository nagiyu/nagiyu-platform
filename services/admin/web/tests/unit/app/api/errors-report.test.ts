/**
 * @jest-environment node
 */
import { GET as listErrors } from '@/app/api/errors/route';
import { GET as getErrorDetail } from '@/app/api/errors/[eventId]/route';
import { reportErrorEvent } from '@nagiyu/aws';
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

const mockReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;
const mockCreateErrorEventReader = createErrorEventReader as jest.MockedFunction<
  typeof createErrorEventReader
>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;

describe('admin /api/errors の reportErrorEvent 連携', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_IN_MEMORY_DB = 'true';
    mockGetSession.mockResolvedValue({
      user: {
        id: 'test-user-id',
        email: 'admin@example.com',
        name: 'Admin',
        roles: ['admin'],
      },
      expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    } as Awaited<ReturnType<typeof getSession>>);
  });

  it('一覧取得 API の内部エラー時に reportErrorEvent を呼ぶ', async () => {
    mockCreateErrorEventReader.mockReturnValue({
      list: jest.fn().mockRejectedValue(new Error('DynamoDB 接続失敗')),
    } as unknown as ReturnType<typeof createErrorEventReader>);

    const response = await listErrors(new Request('http://localhost/api/errors'));

    expect(response.status).toBe(500);
    expect(mockReportErrorEvent).toHaveBeenCalledTimes(1);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'admin',
        severity: 'error',
        title: 'エラー一覧取得 API の実行に失敗しました',
        message: 'DynamoDB 接続失敗',
        context: expect.objectContaining({ endpoint: 'GET /api/errors' }),
      })
    );
  });

  it('詳細取得 API の内部エラー時に reportErrorEvent を呼ぶ', async () => {
    mockCreateErrorEventReader.mockReturnValue({
      findById: jest.fn().mockRejectedValue(new Error('DynamoDB 読み取り失敗')),
    } as unknown as ReturnType<typeof createErrorEventReader>);

    const response = await getErrorDetail(
      new Request('http://localhost/api/errors/evt-1?at=2026-05-16T00:00:00Z&serviceId=admin'),
      { params: Promise.resolve({ eventId: 'evt-1' }) }
    );

    expect(response.status).toBe(500);
    expect(mockReportErrorEvent).toHaveBeenCalledTimes(1);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'admin',
        severity: 'error',
        title: 'エラー詳細取得 API の実行に失敗しました',
        message: 'DynamoDB 読み取り失敗',
        context: expect.objectContaining({ endpoint: 'GET /api/errors/[eventId]' }),
      })
    );
  });
});
