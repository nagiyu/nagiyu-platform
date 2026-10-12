import { reportErrorEvent } from '@nagiyu/aws';
import type { JobRepository } from '@nagiyu/quick-clip-core';
import { getBatchClient, getS3Client } from '@/lib/server/aws';
import { POST } from '@/app/api/jobs/[jobId]/complete-upload/route';

const mockGetById = jest.fn();
const mockUpdateBatchJobId = jest.fn();

jest.mock('@nagiyu/quick-clip-core', () => ({
  ...jest.requireActual('@nagiyu/quick-clip-core'),
  DynamoDBJobRepository: jest.fn().mockImplementation(
    () =>
      ({
        create: jest.fn(),
        getById: mockGetById,
        updateBatchJobId: mockUpdateBatchJobId,
      }) as unknown as JobRepository
  ),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
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
      send: batchSend.mockResolvedValue({ jobId: 'batch-job-1' }),
    } as unknown as ReturnType<typeof getBatchClient>);
    mockedGetS3Client.mockReturnValue({
      send: s3Send.mockResolvedValue({}),
    } as unknown as ReturnType<typeof getS3Client>);
    mockGetById.mockResolvedValue({
      jobId: 'job-1',
      originalFileName: 'movie.mp4',
      fileSize: 1024,
      createdAt: 1,
      expiresAt: 2,
    });
    mockUpdateBatchJobId.mockResolvedValue(undefined);
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
    expect(mockUpdateBatchJobId).toHaveBeenCalledWith('job-1', 'batch-job-1');
  });

  it('正常系: 小サイズ×長尺のジョブは尺軸でジョブ定義が昇格する', async () => {
    mockGetById.mockResolvedValueOnce({
      jobId: 'job-1',
      originalFileName: 'movie.mp4',
      fileSize: 1024,
      durationSec: 12000,
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

    expect(response.status).toBe(200);
    expect(batchSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          jobDefinition: 'nagiyu-quick-clip-dev-xlarge',
        }),
      })
    );
  });

  it('正常系: 大容量ファイルではxlargeジョブ定義でBatch投入する', async () => {
    mockGetById.mockResolvedValueOnce({
      jobId: 'job-1',
      originalFileName: 'movie.mp4',
      fileSize: 9 * 1024 * 1024 * 1024,
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

    expect(response.status).toBe(200);
    expect(batchSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          jobDefinition: 'nagiyu-quick-clip-dev-xlarge',
        }),
      })
    );
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
    expect(mockUpdateBatchJobId).not.toHaveBeenCalled();
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
    expect(mockUpdateBatchJobId).not.toHaveBeenCalled();
  });

  it('異常系: ジョブがPENDING以外の場合は409を返す', async () => {
    mockGetById.mockResolvedValueOnce({
      jobId: 'job-1',
      batchJobId: 'existing-batch-job-1',
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
    expect(mockUpdateBatchJobId).not.toHaveBeenCalled();
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
      '[Web API: アップロード完了処理エラー]',
      multipartError
    );
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'error',
        title: 'Web API: アップロード完了処理エラー',
      })
    );
  });

  it('正常系: emotionFilter未指定時はBatch envにEMOTION_FILTER=anyが設定される', async () => {
    const response = await POST(
      createRequest({
        uploadId: 'upload-1',
        parts: [{ PartNumber: 1, ETag: '"etag-1"' }],
      }),
      {
        params: Promise.resolve({ jobId: 'job-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(batchSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          containerOverrides: expect.objectContaining({
            environment: expect.arrayContaining([{ name: 'EMOTION_FILTER', value: 'any' }]),
          }),
        }),
      })
    );
  });

  it('正常系: emotionFilter指定時はBatch envに反映される', async () => {
    const response = await POST(
      createRequest({
        uploadId: 'upload-1',
        parts: [{ PartNumber: 1, ETag: '"etag-1"' }],
        emotionFilter: 'excite',
      }),
      {
        params: Promise.resolve({ jobId: 'job-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(batchSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          containerOverrides: expect.objectContaining({
            environment: expect.arrayContaining([{ name: 'EMOTION_FILTER', value: 'excite' }]),
          }),
        }),
      })
    );
  });

  it('異常系: 不正なemotionFilterは400を返す', async () => {
    const response = await POST(
      createRequest({
        uploadId: 'upload-1',
        parts: [{ PartNumber: 1, ETag: '"etag-1"' }],
        emotionFilter: 'invalid',
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
  });

  const createBrokenJsonRequest = (): Request =>
    ({
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    }) as unknown as Request;

  describe('不正なリクエストボディ', () => {
    const validBody = { uploadId: 'upload-1', parts: [{ PartNumber: 1, ETag: 'etag-1' }] };

    it.each([
      ['壊れた JSON', () => createBrokenJsonRequest()],
      ['null', () => createRequest(null)],
      ['配列', () => createRequest([validBody])],
      ['文字列', () => createRequest('upload-1')],
      ['uploadId が数値', () => createRequest({ ...validBody, uploadId: 1 })],
      ['parts が配列でない', () => createRequest({ ...validBody, parts: 'etag-1' })],
      ['parts の要素が null', () => createRequest({ ...validBody, parts: [null] })],
      [
        'PartNumber が文字列',
        () => createRequest({ ...validBody, parts: [{ PartNumber: '1', ETag: 'etag-1' }] }),
      ],
      ['ETag が数値', () => createRequest({ ...validBody, parts: [{ PartNumber: 1, ETag: 1 }] })],
      ['emotionFilter が数値', () => createRequest({ ...validBody, emotionFilter: 1 })],
      ['emotionFilter が null', () => createRequest({ ...validBody, emotionFilter: null })],
    ])('異常系: %s の場合は 400 を返し、下流を呼ばない', async (_label, buildRequest) => {
      const response = await POST(buildRequest(), {
        params: Promise.resolve({ jobId: 'job-1' }),
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toEqual({
        error: 'INVALID_REQUEST',
        message: 'リクエストが不正です',
      });
      expect(mockGetById).not.toHaveBeenCalled();
      expect(s3Send).not.toHaveBeenCalled();
      expect(batchSend).not.toHaveBeenCalled();
      expect(mockUpdateBatchJobId).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
