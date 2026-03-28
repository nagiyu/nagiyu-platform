import { GET } from '@/app/api/jobs/[jobId]/highlights/route';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const mockGetJob = jest.fn();
const mockGetHighlights = jest.fn();

jest.mock('@/repositories/dynamodb-job.repository', () => ({
  getJobRepository: jest.fn(() => ({
    create: jest.fn(),
    getById: mockGetJob,
    updateStatus: jest.fn(),
  })),
}));

jest.mock('@/repositories/dynamodb-highlight.repository', () => ({
  getHighlightRepository: jest.fn(() => ({
    getByJobId: mockGetHighlights,
    getById: jest.fn(),
    update: jest.fn(),
  })),
}));

describe('GET /api/jobs/[jobId]/highlights', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRequest = {} as Request;

  it('正常系: 見どころ一覧を返す', async () => {
    mockGetJob.mockResolvedValue({
      jobId: 'job-1',
      status: 'COMPLETED',
      originalFileName: 'movie.mp4',
      fileSize: 100,
      createdAt: 1,
      expiresAt: 2,
    });
    mockGetHighlights.mockResolvedValue([
      {
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        status: 'pending',
      },
    ]);

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      highlights: [
        expect.objectContaining({
          highlightId: 'h1',
        }),
      ],
    });
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
