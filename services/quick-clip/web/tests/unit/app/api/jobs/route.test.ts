import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { JobRepository } from '@nagiyu/quick-clip-core';
import { getBatchClient, getS3Client } from '@/lib/server/aws';
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
  const mockedGetS3Client = getS3Client as jest.MockedFunction<typeof getS3Client>;
  const batchSend = jest.fn();
  const s3Send = jest.fn();
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetSignedUrl.mockResolvedValue('https://example.com/upload');
    mockedGetBatchClient.mockReturnValue({
      send: batchSend.mockResolvedValue({}),
    } as unknown as ReturnType<typeof getBatchClient>);
    mockedGetS3Client.mockReturnValue({
      send: s3Send.mockResolvedValue({ UploadId: 'upload-id-1' }),
    } as unknown as ReturnType<typeof getS3Client>);
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

  it('正常系: 5GB以上のファイルはマルチパートアップロードURLを返す', async () => {
    const partUrls = Array.from(
      { length: 11 },
      (_, index) => `https://example.com/upload-part-${index + 1}`
    );
    partUrls.forEach((url) => {
      mockedGetSignedUrl.mockResolvedValueOnce(url);
    });
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 5 * 1024 * 1024 * 1024 + 1,
      contentType: 'video/mp4',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual(
      expect.objectContaining({
        jobId: expect.any(String),
        status: 'PENDING',
        multipart: {
          uploadId: 'upload-id-1',
          uploadUrls: partUrls,
          chunkSize: 500 * 1024 * 1024,
        },
        expiresIn: 24 * 60 * 60,
      })
    );
    expect(s3Send).toHaveBeenCalledTimes(1);
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(11);
    expect(batchSend).not.toHaveBeenCalled();
  });

  it('正常系: 20GBちょうどのファイルは41パートのURLを返す', async () => {
    const partUrls = Array.from(
      { length: 41 },
      (_, index) => `https://example.com/upload-part-${index + 1}`
    );
    partUrls.forEach((url) => {
      mockedGetSignedUrl.mockResolvedValueOnce(url);
    });
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 20 * 1024 * 1024 * 1024,
      contentType: 'video/mp4',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual(
      expect.objectContaining({
        multipart: expect.objectContaining({
          uploadUrls: partUrls,
          chunkSize: 500 * 1024 * 1024,
        }),
      })
    );
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(41);
    expect(batchSend).not.toHaveBeenCalled();
  });

  it('異常系: 20GB超過のファイルは400を返す', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 20 * 1024 * 1024 * 1024 + 1,
      contentType: 'video/mp4',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_FILE_SIZE',
      message: 'ファイルサイズが不正です',
    });
  });

  it('異常系: マルチパートURL生成で例外が発生した場合は500を返す', async () => {
    mockedGetSignedUrl.mockRejectedValueOnce(new Error('sign failed'));
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 5 * 1024 * 1024 * 1024 + 1,
      contentType: 'video/mp4',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'ジョブの作成に失敗しました',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[POST /api/jobs] ジョブの作成に失敗しました',
      expect.any(Error)
    );
  });

  it('異常系: マルチパートアップロード作成に失敗した場合は500を返す', async () => {
    s3Send.mockRejectedValueOnce(new Error('create multipart failed'));
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 5 * 1024 * 1024 * 1024 + 1,
      contentType: 'video/mp4',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'ジョブの作成に失敗しました',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[POST /api/jobs] ジョブの作成に失敗しました',
      expect.any(Error)
    );
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
