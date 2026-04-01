import { GET } from '@/app/api/jobs/[jobId]/highlights/route';
import type { HighlightRepository, JobRepository } from '@nagiyu/quick-clip-core';
import { getDynamoDBDocumentClient, getLambdaClient, getS3Client } from '@/lib/server/aws';
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
  getLambdaClient: jest.fn(() => ({
    send: jest.fn(),
  })),
  getClipRegenerateFunctionName: jest.fn(() => 'clip-regenerate'),
  getBucketName: jest.fn(() => 'test-bucket'),
  getTableName: jest.fn(() => 'test-table'),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const mockGetJob = jest.fn();
const mockGetHighlights = jest.fn();
const mockGetById = jest.fn();
const mockUpdate = jest.fn();

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
        getById: mockGetById,
        update: mockUpdate,
      }) as unknown as HighlightRepository
  ),
}));

describe('GET /api/jobs/[jobId]/highlights', () => {
  const mockedGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<
    typeof getDynamoDBDocumentClient
  >;
  const mockedGetS3Client = getS3Client as jest.MockedFunction<typeof getS3Client>;
  const mockedGetLambdaClient = getLambdaClient as jest.MockedFunction<typeof getLambdaClient>;
  const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;
  const lambdaSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDynamoDBDocumentClient.mockReturnValue(
      {} as ReturnType<typeof getDynamoDBDocumentClient>
    );
    mockedGetS3Client.mockReturnValue({} as ReturnType<typeof getS3Client>);
    mockedGetLambdaClient.mockReturnValue({
      send: lambdaSend.mockResolvedValue({}),
    } as ReturnType<typeof getLambdaClient>);
    mockedGetSignedUrl.mockResolvedValue('https://example.com/highlight.mp4');
    mockGetById.mockResolvedValue({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      status: 'pending',
      clipStatus: 'PENDING',
    });
    mockUpdate.mockResolvedValue({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      status: 'pending',
      clipStatus: 'GENERATING',
    });
  });

  const mockRequest = {} as Request;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('正常系: PENDING を GENERATING に更新し highlights を返す', async () => {
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
        clipStatus: 'PENDING',
      },
    ]);

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      highlights: [
        expect.objectContaining({
          highlightId: 'h1',
          clipStatus: 'GENERATING',
          clipUrl: undefined,
        }),
      ],
    });
    expect(lambdaSend).toHaveBeenCalledTimes(1);
    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
  });

  it('正常系: GENERATED には clipUrl を付与して返す', async () => {
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
        status: 'accepted',
        clipStatus: 'GENERATED',
      },
    ]);

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.highlights[0]).toEqual(
      expect.objectContaining({
        highlightId: 'h1',
        clipStatus: 'GENERATED',
        clipUrl: 'https://example.com/highlight.mp4',
      })
    );
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

  it('異常系: clipUrl 生成失敗時は500を返す', async () => {
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
        clipStatus: 'GENERATED',
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
