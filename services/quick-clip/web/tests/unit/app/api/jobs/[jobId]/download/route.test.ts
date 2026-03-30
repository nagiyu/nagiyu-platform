import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { HighlightRepository } from '@nagiyu/quick-clip-core';
import { getBatchClient, getS3Client } from '@/lib/server/aws';
import { POST } from '@/app/api/jobs/[jobId]/download/route';

const mockGetByJobId = jest.fn();

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('@nagiyu/quick-clip-core', () => ({
  ...jest.requireActual('@nagiyu/quick-clip-core'),
  DynamoDBHighlightRepository: jest.fn().mockImplementation(
    () =>
      ({
        getByJobId: mockGetByJobId,
        getById: jest.fn(),
        update: jest.fn(),
      }) as unknown as HighlightRepository
  ),
}));

jest.mock('@/lib/server/aws', () => ({
  getAwsRegion: jest.fn(() => 'us-east-1'),
  getBatchClient: jest.fn(),
  getBatchJobDefinitionArn: jest.fn(
    () => 'arn:aws:batch:us-east-1:123456789012:job-definition/quick-clip:1'
  ),
  getBatchJobQueueArn: jest.fn(() => 'arn:aws:batch:us-east-1:123456789012:job-queue/quick-clip'),
  getBucketName: jest.fn(() => 'test-bucket'),
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getS3Client: jest.fn(() => ({})),
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

describe('POST /api/jobs/[jobId]/download', () => {
  const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;
  const mockedGetBatchClient = getBatchClient as jest.MockedFunction<typeof getBatchClient>;
  const mockedGetS3Client = getS3Client as jest.MockedFunction<typeof getS3Client>;
  const batchSend = jest.fn();
  const s3Send = jest.fn();
  let setTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSignedUrl.mockResolvedValue('https://example.com/download');
    mockedGetBatchClient.mockReturnValue({
      send: batchSend.mockResolvedValue({}),
    } as unknown as ReturnType<typeof getBatchClient>);
    mockedGetS3Client.mockReturnValue({
      send: s3Send.mockResolvedValue({}),
    } as unknown as ReturnType<typeof getS3Client>);
    setTimeoutSpy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((callback: TimerHandler): NodeJS.Timeout => {
        if (typeof callback === 'function') {
          callback();
        }
        return {} as NodeJS.Timeout;
      });
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
  });

  const mockRequest = {} as Request;

  it('正常系: ダウンロードURL生成とBatch投入を行う', async () => {
    mockGetByJobId.mockResolvedValue([
      {
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        status: 'accepted',
      },
    ]);

    const response = await POST(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      jobId: 'job-1',
      fileName: 'job-1-clips.zip',
      downloadUrl: 'https://example.com/download',
    });
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1);
    expect(batchSend).toHaveBeenCalledTimes(1);
    expect(s3Send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: 'test-bucket',
          Key: 'outputs/job-1/clips.zip',
        },
      })
    );
  });

  it('異常系: 採用見どころがない場合は400を返す', async () => {
    mockGetByJobId.mockResolvedValue([
      {
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        status: 'rejected',
      },
    ]);

    const response = await POST(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'DOWNLOAD_NOT_AVAILABLE',
      message: '採用された見どころがありません',
    });
  });

  it('異常系: Zipが生成されない場合は500を返す', async () => {
    mockGetByJobId.mockResolvedValue([
      {
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        status: 'accepted',
      },
    ]);
    s3Send.mockRejectedValue(Object.assign(new Error('missing'), { name: 'NoSuchKey' }));

    const response = await POST(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'ダウンロードの準備に失敗しました',
    });
    expect(s3Send).toHaveBeenCalledTimes(20);
    expect(s3Send).toHaveBeenLastCalledWith(expect.any(HeadObjectCommand));
    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
  });
});
