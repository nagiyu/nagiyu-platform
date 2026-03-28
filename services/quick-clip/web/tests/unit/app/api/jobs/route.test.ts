import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
  getBatchJobDefinitionArn: jest.fn(
    () => 'arn:aws:batch:us-east-1:123456789012:job-definition/quick-clip:1'
  ),
  getBatchJobQueueArn: jest.fn(() => 'arn:aws:batch:us-east-1:123456789012:job-queue/quick-clip'),
  getBucketName: jest.fn(() => 'test-bucket'),
  getS3Client: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
}));

jest.mock('@/repositories/dynamodb-job.repository', () => ({
  getJobRepository: jest.fn(() => ({
    create: jest.fn(async (job) => job),
    getById: jest.fn(),
    updateStatus: jest.fn(),
  })),
}));

describe('POST /api/jobs', () => {
  const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;
  const mockedGetBatchClient = getBatchClient as jest.MockedFunction<typeof getBatchClient>;
  const batchSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSignedUrl.mockResolvedValue('https://example.com/upload');
    mockedGetBatchClient.mockReturnValue({
      send: batchSend.mockResolvedValue({}),
    } as unknown as ReturnType<typeof getBatchClient>);
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
});
