import { GET } from '@/app/api/jobs/[jobId]/highlights/route';
import type { HighlightRepository, JobRepository } from '@nagiyu/quick-clip-core';
import {
  getClipRegenerateFunctionName,
  getDynamoDBDocumentClient,
  getLambdaClient,
  getS3Client,
} from '@/lib/server/aws';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { InvokeCommand } from '@aws-sdk/client-lambda';

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
  getLambdaClient: jest.fn(() => ({ send: jest.fn() })),
  getClipRegenerateFunctionName: jest.fn(() => 'clip-regenerate'),
  getBucketName: jest.fn(() => 'test-bucket'),
  getTableName: jest.fn(() => 'test-table'),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  InvokeCommand: jest.fn().mockImplementation((input: unknown) => input),
}));

const mockGetJob = jest.fn();
const mockGetHighlights = jest.fn();
const mockGetById = jest.fn();
const mockUpdate = jest.fn();
const mockLambdaSend = jest.fn();
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
  const mockedGetClipRegenerateFunctionName = getClipRegenerateFunctionName as jest.MockedFunction<
    typeof getClipRegenerateFunctionName
  >;
  const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;
  const mockedInvokeCommand = InvokeCommand as jest.MockedFunction<typeof InvokeCommand>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetDynamoDBDocumentClient.mockReturnValue(
      {} as ReturnType<typeof getDynamoDBDocumentClient>
    );
    mockedGetS3Client.mockReturnValue({} as ReturnType<typeof getS3Client>);
    mockedGetLambdaClient.mockReturnValue({
      send: mockLambdaSend,
    } as ReturnType<typeof getLambdaClient>);
    mockedGetClipRegenerateFunctionName.mockReturnValue('clip-regenerate');
    mockedGetSignedUrl.mockResolvedValue('https://example.com/highlight.mp4');
    mockLambdaSend.mockResolvedValue({});
    mockGetById.mockResolvedValue({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      source: 'motion',
      status: 'unconfirmed',
      clipStatus: 'PENDING',
    });
    mockUpdate.mockResolvedValue({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      source: 'motion',
      status: 'unconfirmed',
      clipStatus: 'GENERATING',
    });
  });

  const mockRequest = {} as Request;

  afterEach(() => {
    jest.restoreAllMocks();
    consoleErrorSpy.mockRestore();
  });

  it('正常系: 初回（全件PENDING）では全クリップ生成を開始して GENERATING を返す', async () => {
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
        source: 'motion',
        status: 'unconfirmed',
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
          source: 'motion',
          clipStatus: 'GENERATING',
          clipUrl: undefined,
        }),
      ],
    });
    expect(mockedInvokeCommand).toHaveBeenCalledWith({
      FunctionName: 'clip-regenerate',
      InvocationType: 'Event',
      Payload: Buffer.from(
        JSON.stringify({
          jobId: 'job-1',
          highlightId: 'h1',
          startSec: 10,
          endSec: 20,
        })
      ),
    });
    expect(mockLambdaSend).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('job-1', 'h1', { clipStatus: 'GENERATING' });
    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
  });

  it('正常系: PENDING と GENERATING が混在する場合は PENDING のみ対象に起動する', async () => {
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
        source: 'motion',
        status: 'unconfirmed',
        clipStatus: 'PENDING',
      },
      {
        highlightId: 'h2',
        jobId: 'job-1',
        order: 2,
        startSec: 25,
        endSec: 35,
        source: 'volume',
        status: 'unconfirmed',
        clipStatus: 'GENERATING',
      },
    ]);
    mockUpdate.mockResolvedValueOnce({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      source: 'motion',
      status: 'unconfirmed',
      clipStatus: 'GENERATING',
    });

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ highlightId: 'h1', clipStatus: 'GENERATING' }),
        expect.objectContaining({ highlightId: 'h2', clipStatus: 'GENERATING' }),
      ])
    );
    expect(mockLambdaSend).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('job-1', 'h1', { clipStatus: 'GENERATING' });
  });

  it('正常系: PENDING が存在しない場合はクリップ生成開始を行わない', async () => {
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
        source: 'motion',
        status: 'accepted',
        clipStatus: 'GENERATED',
        clipUrl: 'https://example.com/h1.mp4',
      },
      {
        highlightId: 'h2',
        jobId: 'job-1',
        order: 2,
        startSec: 25,
        endSec: 35,
        source: 'volume',
        status: 'unconfirmed',
        clipStatus: 'GENERATING',
      },
    ]);
    mockedGetSignedUrl.mockResolvedValue('https://example.com/h1.mp4');

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ highlightId: 'h1', clipStatus: 'GENERATED' }),
        expect.objectContaining({ highlightId: 'h2', clipStatus: 'GENERATING' }),
      ])
    );
    expect(mockLambdaSend).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('正常系: 初回時に一部の起動が失敗しても成功分のみ GENERATING に更新する', async () => {
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
        source: 'motion',
        status: 'unconfirmed',
        clipStatus: 'PENDING',
      },
      {
        highlightId: 'h2',
        jobId: 'job-1',
        order: 2,
        startSec: 25,
        endSec: 35,
        source: 'volume',
        status: 'unconfirmed',
        clipStatus: 'PENDING',
      },
    ]);
    mockLambdaSend.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('invoke failed'));
    mockUpdate.mockResolvedValueOnce({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      source: 'motion',
      status: 'unconfirmed',
      clipStatus: 'GENERATING',
    });

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ highlightId: 'h1', clipStatus: 'GENERATING' }),
        expect.objectContaining({ highlightId: 'h2', clipStatus: 'PENDING' }),
      ])
    );
    expect(mockLambdaSend).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[GET /api/jobs/[jobId]/highlights] 初回クリップ生成の起動に失敗しました',
      expect.objectContaining({
        jobId: 'job-1',
        highlightId: 'h2',
        error: expect.any(Error),
      })
    );
  });

  it('正常系: 初回時に更新失敗があっても他の見どころ取得は継続する', async () => {
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
        source: 'motion',
        status: 'unconfirmed',
        clipStatus: 'PENDING',
      },
      {
        highlightId: 'h2',
        jobId: 'job-1',
        order: 2,
        startSec: 25,
        endSec: 35,
        source: 'volume',
        status: 'unconfirmed',
        clipStatus: 'PENDING',
      },
    ]);
    mockLambdaSend.mockResolvedValue({});
    mockUpdate.mockRejectedValueOnce(new Error('update failed')).mockResolvedValueOnce({
      highlightId: 'h2',
      jobId: 'job-1',
      order: 2,
      startSec: 25,
      endSec: 35,
      source: 'volume',
      status: 'unconfirmed',
      clipStatus: 'GENERATING',
    });

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ highlightId: 'h1', clipStatus: 'PENDING' }),
        expect.objectContaining({ highlightId: 'h2', clipStatus: 'GENERATING' }),
      ])
    );
    expect(mockLambdaSend).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[GET /api/jobs/[jobId]/highlights] 初回クリップ生成状態の更新に失敗しました',
      expect.objectContaining({
        jobId: 'job-1',
        highlightId: 'h1',
        error: expect.any(Error),
      })
    );
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
        source: 'both',
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
        source: 'both',
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
        source: 'volume',
        status: 'unconfirmed',
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
