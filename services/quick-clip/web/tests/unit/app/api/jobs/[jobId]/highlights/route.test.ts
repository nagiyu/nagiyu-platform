import { GET } from '@/app/api/jobs/[jobId]/highlights/route';
import type { HighlightRepository, JobRepository } from '@nagiyu/quick-clip-core';
import { getDynamoDBDocumentClient, getS3Client } from '@/lib/server/aws';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
  getS3Client: jest.fn(() => ({})),
  getBucketName: jest.fn(() => 'test-bucket'),
  getTableName: jest.fn(() => 'test-table'),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const mockGetJob = jest.fn();
const mockGetHighlights = jest.fn();

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
  DynamoDBHighlightRepository: jest.fn().mockImplementation(
    () =>
      ({
        getByJobId: mockGetHighlights,
        getById: jest.fn(),
        update: jest.fn(),
      }) as unknown as HighlightRepository
  ),
}));

describe('GET /api/jobs/[jobId]/highlights', () => {
  const mockedGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<
    typeof getDynamoDBDocumentClient
  >;
  const mockedGetS3Client = getS3Client as jest.MockedFunction<typeof getS3Client>;
  const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDynamoDBDocumentClient.mockReturnValue(
      {} as ReturnType<typeof getDynamoDBDocumentClient>
    );
    mockedGetS3Client.mockReturnValue({} as ReturnType<typeof getS3Client>);
    mockedGetSignedUrl.mockResolvedValue('https://example.com/highlight.mp4');
  });

  const mockRequest = {} as Request;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('正常系: 見どころ一覧と元動画URLを返す', async () => {
    mockGetJob.mockResolvedValue({
      jobId: 'job-1',
      status: 'COMPLETED',
      originalFileName: 'movie.mp4',
      fileSize: 100,
      createdAt: 1,
      expiresAt: 2,
    });
    mockGetHighlights.mockResolvedValue([
      {
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        status: 'pending',
      },
    ]);

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      sourceVideoUrl: 'https://example.com/highlight.mp4',
      highlights: [
        expect.objectContaining({
          highlightId: 'h1',
        }),
      ],
    });
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1);
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

  it('異常系: 元動画URL生成失敗時は500を返す', async () => {
    mockGetJob.mockResolvedValue({
      jobId: 'job-1',
      status: 'COMPLETED',
      originalFileName: 'movie.mp4',
      fileSize: 100,
      createdAt: 1,
      expiresAt: 2,
    });
    mockGetHighlights.mockResolvedValue([
      {
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        status: 'pending',
      },
    ]);
    mockedGetSignedUrl.mockRejectedValueOnce(new Error('signed-url-failed'));

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: '見どころ一覧の取得に失敗しました',
    });
  });
});
