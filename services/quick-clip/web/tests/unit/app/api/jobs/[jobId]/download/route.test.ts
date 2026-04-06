import type { HighlightRepository } from '@nagiyu/quick-clip-core';
import { getLambdaClient, getS3Client } from '@/lib/server/aws';
import { GET, POST } from '@/app/api/jobs/[jobId]/download/route';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

type DownloadResponse = {
  jobId: string;
  fileName: string;
  downloadUrl: string;
};

const mockGetByJobId = jest.fn();
const mockGetSignedUrl = jest.fn();

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
  getLambdaClient: jest.fn(),
  getS3Client: jest.fn(),
  getZipGeneratorFunctionName: jest.fn(() => 'zip-generator'),
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
  getBucketName: jest.fn(() => 'test-bucket'),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

describe('GET /api/jobs/[jobId]/download', () => {
  const mockedGetS3Client = getS3Client as jest.MockedFunction<typeof getS3Client>;
  const s3Send = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetS3Client.mockReturnValue({
      send: s3Send,
    } as ReturnType<typeof getS3Client>);
    mockGetSignedUrl.mockResolvedValue('https://example.com/clips.zip?signed=1');
  });

  const mockRequest = {} as Request;

  it('正常系: ZIP が S3 に存在する場合は署名URL を返す', async () => {
    s3Send.mockResolvedValue({});

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = (await response.json()) as DownloadResponse;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      jobId: 'job-1',
      fileName: 'job-1-clips.zip',
      downloadUrl: 'https://example.com/clips.zip?signed=1',
    });
  });

  it('正常系: ZIP が S3 に存在しない場合は202を返す', async () => {
    const noSuchKey = Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
    s3Send.mockRejectedValue(noSuchKey);

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = (await response.json()) as { status: string };

    expect(response.status).toBe(202);
    expect(body).toEqual({ status: 'PROCESSING' });
  });

  it('異常系: S3 アクセスエラーの場合は500を返す', async () => {
    const accessDenied = Object.assign(new Error('AccessDenied'), { name: 'AccessDenied' });
    s3Send.mockRejectedValue(accessDenied);

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });

    expect(response.status).toBe(500);
  });
});

describe('POST /api/jobs/[jobId]/download', () => {
  const mockedGetLambdaClient = getLambdaClient as jest.MockedFunction<typeof getLambdaClient>;
  const mockedGetS3Client = getS3Client as jest.MockedFunction<typeof getS3Client>;
  const lambdaSend = jest.fn();
  const s3Send = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetLambdaClient.mockReturnValue({
      send: lambdaSend,
    } as ReturnType<typeof getLambdaClient>);
    mockedGetS3Client.mockReturnValue({
      send: s3Send,
    } as ReturnType<typeof getS3Client>);
    s3Send.mockResolvedValue({});
    lambdaSend.mockResolvedValue({ StatusCode: 202 });
  });

  const mockRequest = {} as Request;

  it('正常系: zip-generator Lambda を非同期 Invoke して202を返す', async () => {
    mockGetByJobId.mockResolvedValue([
      {
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        status: 'accepted',
        clipStatus: 'GENERATED',
      },
      {
        highlightId: 'h2',
        jobId: 'job-1',
        order: 2,
        startSec: 30,
        endSec: 40,
        status: 'accepted',
        clipStatus: 'FAILED',
      },
    ]);

    const response = await POST(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = (await response.json()) as { status: string };

    expect(response.status).toBe(202);
    expect(body).toEqual({ status: 'PROCESSING' });
    expect(lambdaSend).toHaveBeenCalledTimes(1);
  });

  it('正常系: Lambda 呼び出し前に旧 ZIP を S3 から削除する', async () => {
    mockGetByJobId.mockResolvedValue([
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

    await POST(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });

    expect(s3Send).toHaveBeenCalledTimes(1);
    const deleteCall = s3Send.mock.calls[0][0];
    expect(deleteCall).toBeInstanceOf(DeleteObjectCommand);
  });

  it('正常系: 旧 ZIP の削除が失敗しても Lambda を Invoke して202を返す', async () => {
    mockGetByJobId.mockResolvedValue([
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
    s3Send.mockRejectedValue(new Error('AccessDenied'));

    const response = await POST(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = (await response.json()) as { status: string };

    expect(response.status).toBe(202);
    expect(body).toEqual({ status: 'PROCESSING' });
    expect(lambdaSend).toHaveBeenCalledTimes(1);
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
        clipStatus: 'GENERATED',
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
    expect(lambdaSend).not.toHaveBeenCalled();
  });

  it('異常系: 採用見どころに PENDING がある場合は409を返す', async () => {
    mockGetByJobId.mockResolvedValue([
      {
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        status: 'accepted',
        clipStatus: 'PENDING',
      },
    ]);

    const response = await POST(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: 'CLIP_GENERATION_INCOMPLETE',
      message: '採用された見どころのクリップ生成が完了していません',
    });
    expect(lambdaSend).not.toHaveBeenCalled();
  });
});
