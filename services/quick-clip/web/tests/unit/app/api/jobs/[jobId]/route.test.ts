import { GET } from '@/app/api/jobs/[jobId]/route';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const mockGetJob = jest.fn();

jest.mock('@/repositories/dynamodb-job.repository', () => ({
  getJobRepository: jest.fn(() => ({
    create: jest.fn(),
    getById: mockGetJob,
    updateStatus: jest.fn(),
  })),
}));

describe('GET /api/jobs/[jobId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRequest = {} as Request;

  it('正常系: ジョブ情報を返す', async () => {
    mockGetJob.mockResolvedValue({
      jobId: 'job-1',
      status: 'PROCESSING',
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
    expect(body).toEqual(
      expect.objectContaining({
        jobId: 'job-1',
        status: 'PROCESSING',
      })
    );
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
});
