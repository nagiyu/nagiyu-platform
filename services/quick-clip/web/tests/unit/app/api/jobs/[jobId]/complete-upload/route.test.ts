import type { JobRepository } from '@nagiyu/quick-clip-core';
import { getBatchClient, getS3Client } from '@/lib/server/aws';
import { POST } from '@/app/api/jobs/[jobId]/complete-upload/route';

const mockGetById = jest.fn();
const mockUpdateStatus = jest.fn();

jest.mock('@nagiyu/quick-clip-core', () => ({
  ...jest.requireActual('@nagiyu/quick-clip-core'),
  DynamoDBJobRepository: jest.fn().mockImplementation(
    () =>
      ({
        create: jest.fn(),
        getById: mockGetById,
        updateStatus: mockUpdateStatus,
      }) as unknown as JobRepository
  ),
}));

jest.mock('@/lib/server/aws', () => ({
  getAwsRegion: jest.fn(() => 'us-east-1'),
  getBatchClient: jest.fn(),
  getBatchJobDefinitionPrefix: jest.fn(() => 'nagiyu-quick-clip-dev'),
  getBatchJobQueueArn: jest.fn(() => 'arn:aws:batch:us-east-1:123456789012:job-queue/quick-clip'),
  getBucketName: jest.fn(() => 'test-bucket'),
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getS3Client: jest.fn(),
  getTableName: jest.fn(() => 'test-table'),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

describe('POST /api/jobs/[jobId]/complete-upload', () => {
  const mockedGetBatchClient = getBatchClient as jest.MockedFunction<typeof getBatchClient>;
  const mockedGetS3Client = getS3Client as jest.MockedFunction<typeof getS3Client>;
  const batchSend = jest.fn();
  const s3Send = jest.fn();
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetBatchClient.mockReturnValue({
      send: batchSend.mockResolvedValue({}),
    } as ReturnType<typeof getBatchClient>);
    mockedGetS3Client.mockReturnValue({
      send: s3Send.mockResolvedValue({}),
    } as ReturnType<typeof getS3Client>);
    mockGetById.mockResolvedValue({
      jobId: 'job-1',
      status: 'PENDING',
      originalFileName: 'movie.mp4',
      fileSize: 1024,
      createdAt: 1,
      expiresAt: 2,
    });
    mockUpdateStatus.mockResolvedValue({
      jobId: 'job-1',
      status: 'PROCESSING',
      originalFileName: 'movie.mp4',
      fileSize: 1024,
      createdAt: 1,
      expiresAt: 2,
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const createRequest = (body: unknown): Request =>
    ({
      json: async () => body,
    }) as Request;

  it('正常系: マルチパート完了後にBatch投入し、ジョブをPROCESSINGに更新する', async () => {
    const response = await POST(
      createRequest({
        uploadId: 'upload-1',
        parts: [
          { PartNumber: 1, ETag: '"etag-1"' },
          { PartNumber: 2, ETag: '"etag-2"' },
        ],
      }),
      {
        params: Promise.resolve({ jobId: 'job-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(s3Send).toHaveBeenCalledTimes(1);
    expect(batchSend).toHaveBeenCalledTimes(1);
    expect(batchSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          jobDefinition: 'nagiyu-quick-clip-dev-small',
        }),
      })
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith('job-1', 'PROCESSING', undefined);
  });

  it('異常系: リクエストボディが不正な場合は400を返す', async () => {
    const response = await POST(
      createRequest({
        uploadId: '',
        parts: [],
      }),
      {
        params: Promise.resolve({ jobId: 'job-1' }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_REQUEST',
      message: 'リクエストが不正です',
    });
    expect(s3Send).not.toHaveBeenCalled();
    expect(batchSend).not.toHaveBeenCalled();
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it('異常系: ジョブが存在しない場合は404を返す', async () => {
    mockGetById.mockResolvedValueOnce(null);

    const response = await POST(
      createRequest({
        uploadId: 'upload-1',
        parts: [{ PartNumber: 1, ETag: '"etag-1"' }],
      }),
      {
        params: Promise.resolve({ jobId: 'missing' }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: 'JOB_NOT_FOUND',
      message: '指定されたジョブが見つかりません',
    });
    expect(s3Send).not.toHaveBeenCalled();
    expect(batchSend).not.toHaveBeenCalled();
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it('異常系: ジョブがPENDING以外の場合は409を返す', async () => {
    mockGetById.mockResolvedValueOnce({
      jobId: 'job-1',
      status: 'PROCESSING',
      originalFileName: 'movie.mp4',
      fileSize: 1024,
      createdAt: 1,
      expiresAt: 2,
    });

    const response = await POST(
      createRequest({
        uploadId: 'upload-1',
        parts: [{ PartNumber: 1, ETag: '"etag-1"' }],
      }),
      {
        params: Promise.resolve({ jobId: 'job-1' }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: 'JOB_NOT_PENDING',
      message: 'ジョブがアップロード完了可能な状態ではありません',
    });
    expect(s3Send).not.toHaveBeenCalled();
    expect(batchSend).not.toHaveBeenCalled();
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it('異常系: CompleteMultipartUpload失敗時は500を返す', async () => {
    const multipartError = new Error('complete failed');
    s3Send.mockRejectedValueOnce(multipartError);

    const response = await POST(
      createRequest({
        uploadId: 'upload-1',
        parts: [{ PartNumber: 1, ETag: '"etag-1"' }],
      }),
      {
        params: Promise.resolve({ jobId: 'job-1' }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'アップロード完了処理に失敗しました',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[POST /api/jobs/[jobId]/complete-upload] アップロード完了処理に失敗しました',
      multipartError
    );
  });
});
