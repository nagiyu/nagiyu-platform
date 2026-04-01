import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { JobRepository } from '@nagiyu/quick-clip-core';
import { getBatchClient } from '@/lib/server/aws';
import { POST } from '@/app/api/jobs/route';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('@/lib/server/aws', () => ({
  getAwsRegion: jest.fn(() => 'us-east-1'),
  getBatchClient: jest.fn(),
  getBatchJobDefinitionPrefix: jest.fn(() => 'nagiyu-quick-clip-dev'),
  getBatchJobQueueArn: jest.fn(() => 'arn:aws:batch:us-east-1:123456789012:job-queue/quick-clip'),
  getBucketName: jest.fn(() => 'test-bucket'),
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getS3Client: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
}));

jest.mock('@nagiyu/quick-clip-core', () => ({
  ...jest.requireActual('@nagiyu/quick-clip-core'),
  DynamoDBJobRepository: jest.fn().mockImplementation(
    () =>
      ({
        create: jest.fn(async (job) => job),
        getById: jest.fn(),
        updateStatus: jest.fn(),
      }) as unknown as JobRepository
  ),
}));

describe('POST /api/jobs', () => {
  const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;
  const mockedGetBatchClient = getBatchClient as jest.MockedFunction<typeof getBatchClient>;
  const batchSend = jest.fn();
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetSignedUrl.mockResolvedValue('https://example.com/upload');
    mockedGetBatchClient.mockReturnValue({
      send: batchSend.mockResolvedValue({}),
    } as unknown as ReturnType<typeof getBatchClient>);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const createRequest = (body: unknown): Request =>
    ({
      json: async () => body,
    }) as Request;

  it('正常系: ジョブ作成・Presigned URL生成・Batch投入を行う', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 1024,
      contentType: 'video/mp4',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual(
      expect.objectContaining({
        jobId: expect.any(String),
        status: 'PENDING',
        uploadUrl: 'https://example.com/upload',
        expiresIn: 3600,
      })
    );
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1);
    expect(batchSend).toHaveBeenCalledTimes(1);
    expect(batchSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          jobDefinition: 'nagiyu-quick-clip-dev-small',
        }),
      })
    );
  });

  it('異常系: MP4以外のファイルは400を返す', async () => {
    const request = createRequest({
      fileName: 'movie.mov',
      fileSize: 1024,
      contentType: 'video/quicktime',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_FILE_TYPE',
      message: 'MP4 形式の動画ファイルのみアップロードできます',
    });
  });

  it('異常系: Batchジョブ作成に失敗した場合は500を返しエラーログを出力する', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 1024,
      contentType: 'video/mp4',
    });
    const batchError = new Error('submit failed');
    batchSend.mockRejectedValueOnce(batchError);

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'ジョブの作成に失敗しました',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[POST /api/jobs] ジョブの作成に失敗しました',
      batchError
    );
  });
});
