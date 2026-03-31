import type { HighlightRepository } from '@nagiyu/quick-clip-core';
import { getLambdaClient } from '@/lib/server/aws';
import { POST } from '@/app/api/jobs/[jobId]/download/route';

const mockGetByJobId = jest.fn();

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
  getZipGeneratorFunctionName: jest.fn(() => 'zip-generator'),
  getDynamoDBDocumentClient: jest.fn(() => ({})),
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
  const mockedGetLambdaClient = getLambdaClient as jest.MockedFunction<typeof getLambdaClient>;
  const lambdaSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetLambdaClient.mockReturnValue({
      send: lambdaSend,
    } as ReturnType<typeof getLambdaClient>);
  });

  const mockRequest = {} as Request;

  it('正常系: zip-generator Lambda を同期 Invoke してダウンロードURLを返す', async () => {
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
    lambdaSend.mockResolvedValue({
      Payload: Buffer.from(JSON.stringify({ downloadUrl: 'https://example.com/download' })),
    });

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

  it('異常系: Lambda 応答に URL がない場合は500を返す', async () => {
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
    lambdaSend.mockResolvedValue({
      Payload: Buffer.from(JSON.stringify({})),
    });

    const response = await POST(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'ZIP_GENERATION_FAILED',
      message: 'ダウンロードファイルの生成に失敗しました',
    });
  });
});
