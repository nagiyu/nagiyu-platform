import { GET } from '@/app/api/jobs/[jobId]/route';
import type { JobRepository } from '@nagiyu/quick-clip-core';
import { getDynamoDBDocumentClient } from '@/lib/server/aws';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/server/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
}));

const mockGetJob = jest.fn();

jest.mock('@nagiyu/quick-clip-core', () => ({
  ...jest.requireActual('@nagiyu/quick-clip-core'),
  DynamoDBJobRepository: jest.fn().mockImplementation(
    () =>
      ({
        create: jest.fn(),
        getById: mockGetJob,
        updateStatus: jest.fn(),
      }) as unknown as JobRepository
  ),
}));

describe('GET /api/jobs/[jobId]', () => {
  const mockedGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<
    typeof getDynamoDBDocumentClient
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDynamoDBDocumentClient.mockReturnValue(
      {} as ReturnType<typeof getDynamoDBDocumentClient>
    );
  });

  const mockRequest = {} as Request;

  it('正常系: ジョブ情報を返す', async () => {
    mockGetJob.mockResolvedValue({
      jobId: 'job-1',
      status: 'PROCESSING',
      originalFileName: 'movie.mp4',
      fileSize: 100,
      createdAt: 1,
      expiresAt: 2,
    });

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        jobId: 'job-1',
        status: 'PROCESSING',
      })
    );
  });

  it('異常系: ジョブが存在しない場合は404を返す', async () => {
    mockGetJob.mockResolvedValue(null);

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'missing' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: 'JOB_NOT_FOUND',
      message: '指定されたジョブが見つかりません',
    });
  });
});
