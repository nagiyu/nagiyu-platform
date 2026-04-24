import { GET } from '@/app/api/jobs/[jobId]/route';
import type { JobRepository } from '@nagiyu/quick-clip-core';
import { getBatchClient, getDynamoDBDocumentClient } from '@/lib/server/aws';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/server/aws', () => ({
  getBatchClient: jest.fn(),
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
}));

const mockGetJob = jest.fn();

jest.mock('@nagiyu/quick-clip-core', () => ({
  ...jest.requireActual('@nagiyu/quick-clip-core'),
  DynamoDBJobRepository: jest.fn().mockImplementation(
    () =>
      ({
        create: jest.fn(),
        getById: mockGetJob,
        updateBatchJobId: jest.fn(),
      }) as unknown as JobRepository
  ),
}));

describe('GET /api/jobs/[jobId]', () => {
  const mockedGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<
    typeof getDynamoDBDocumentClient
  >;
  const mockedGetBatchClient = getBatchClient as jest.MockedFunction<typeof getBatchClient>;
  const batchSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDynamoDBDocumentClient.mockReturnValue(
      {} as ReturnType<typeof getDynamoDBDocumentClient>
    );
    mockedGetBatchClient.mockReturnValue({
      send: batchSend,
    } as unknown as ReturnType<typeof getBatchClient>);
  });

  const mockRequest = {} as Request;

  it('正常系: batchJobId未設定の場合はstatus=PENDINGを返す', async () => {
    mockGetJob.mockResolvedValue({
      jobId: 'job-1',
      originalFileName: 'movie.mp4',
      fileSize: 100,
      createdAt: 1,
      expiresAt: 2,
    });

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      jobId: 'job-1',
      status: 'PENDING',
      originalFileName: 'movie.mp4',
      fileSize: 100,
      createdAt: 1,
      expiresAt: 2,
    });
    expect(batchSend).not.toHaveBeenCalled();
  });

  it('正常系: Batch状態がRUNNINGの場合はstatus=PROCESSINGとbatchStageを返す', async () => {
    mockGetJob.mockResolvedValue({
      jobId: 'job-2',
      batchJobId: 'batch-1',
      batchStage: 'analyzing',
      originalFileName: 'movie.mp4',
      fileSize: 200,
      createdAt: 1,
      expiresAt: 2,
    });
    batchSend.mockResolvedValue({ jobs: [{ status: 'RUNNING' }] });

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-2' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      jobId: 'job-2',
      status: 'PROCESSING',
      batchStage: 'analyzing',
      originalFileName: 'movie.mp4',
      fileSize: 200,
      createdAt: 1,
      expiresAt: 2,
    });
  });

  it('正常系: batchStage=analyzing かつ analysisProgress がある場合は analysisProgress も返す', async () => {
    const analysisProgress = {
      motion: { status: 'done' },
      volume: { status: 'processing' },
      transcription: { status: 'processing', completed: 2, total: 5 },
    };
    mockGetJob.mockResolvedValue({
      jobId: 'job-2b',
      batchJobId: 'batch-1b',
      batchStage: 'analyzing',
      analysisProgress,
      originalFileName: 'movie.mp4',
      fileSize: 200,
      createdAt: 1,
      expiresAt: 2,
    });
    batchSend.mockResolvedValue({ jobs: [{ status: 'RUNNING' }] });

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-2b' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('PROCESSING');
    expect(body.batchStage).toBe('analyzing');
    expect(body.analysisProgress).toEqual(analysisProgress);
  });

  it('正常系: Batch状態がSUCCEEDEDの場合はstatus=COMPLETEDを返す', async () => {
    mockGetJob.mockResolvedValue({
      jobId: 'job-3',
      batchJobId: 'batch-2',
      originalFileName: 'movie.mp4',
      fileSize: 300,
      createdAt: 1,
      expiresAt: 2,
    });
    batchSend.mockResolvedValue({ jobs: [{ status: 'SUCCEEDED' }] });

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-3' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('COMPLETED');
    expect(body.errorMessage).toBeUndefined();
  });

  it('正常系: Batch状態がFAILEDの場合はstatus=FAILEDとerrorMessageを返す', async () => {
    mockGetJob.mockResolvedValue({
      jobId: 'job-4',
      batchJobId: 'batch-3',
      originalFileName: 'movie.mp4',
      fileSize: 400,
      createdAt: 1,
      expiresAt: 2,
      errorMessage: '処理に失敗しました',
    });
    batchSend.mockResolvedValue({ jobs: [{ status: 'FAILED' }] });

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-4' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('FAILED');
    expect(body.errorMessage).toBe('処理に失敗しました');
  });

  it.each([['SUBMITTED'], ['PENDING'], ['RUNNABLE'], ['STARTING']])(
    '正常系: Batch状態が%sの場合はstatus=PENDINGを返す',
    async (batchStatus) => {
      mockGetJob.mockResolvedValue({
        jobId: 'job-5',
        batchJobId: 'batch-4',
        originalFileName: 'movie.mp4',
        fileSize: 500,
        createdAt: 1,
        expiresAt: 2,
      });
      batchSend.mockResolvedValue({ jobs: [{ status: batchStatus }] });

      const response = await GET(mockRequest, {
        params: Promise.resolve({ jobId: 'job-5' }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe('PENDING');
    }
  );

  it('正常系: Batchジョブが見つからない場合はstatus=FAILEDを返す', async () => {
    mockGetJob.mockResolvedValue({
      jobId: 'job-6',
      batchJobId: 'batch-5',
      originalFileName: 'movie.mp4',
      fileSize: 600,
      createdAt: 1,
      expiresAt: 2,
    });
    batchSend.mockResolvedValue({ jobs: [] });

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-6' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('FAILED');
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

  it('異常系: DynamoDB呼び出しで例外が発生した場合は404を返す', async () => {
    mockGetJob.mockRejectedValue(new Error('DynamoDB error'));

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-err' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: 'JOB_NOT_FOUND',
      message: '指定されたジョブが見つかりません',
    });
  });

  it('異常系: Batch API呼び出しで例外が発生した場合は404を返す', async () => {
    mockGetJob.mockResolvedValue({
      jobId: 'job-7',
      batchJobId: 'batch-6',
      originalFileName: 'movie.mp4',
      fileSize: 700,
      createdAt: 1,
      expiresAt: 2,
    });
    batchSend.mockRejectedValue(new Error('Batch API error'));

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-7' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: 'JOB_NOT_FOUND',
      message: '指定されたジョブが見つかりません',
    });
  });
});
