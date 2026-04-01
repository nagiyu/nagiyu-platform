import { PATCH } from '@/app/api/jobs/[jobId]/highlights/[highlightId]/route';
import type { HighlightRepository } from '@nagiyu/quick-clip-core';
import { getDynamoDBDocumentClient } from '@/lib/server/aws';

const mockUpdate = jest.fn();
const mockGetById = jest.fn();

jest.mock('@nagiyu/quick-clip-core', () => ({
  ...jest.requireActual('@nagiyu/quick-clip-core'),
  DynamoDBHighlightRepository: jest.fn().mockImplementation(
    () =>
      ({
        getByJobId: jest.fn(),
        getById: mockGetById,
        update: mockUpdate,
      }) as unknown as HighlightRepository
  ),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/server/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
}));

describe('PATCH /api/jobs/[jobId]/highlights/[highlightId]', () => {
  const mockedGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<
    typeof getDynamoDBDocumentClient
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDynamoDBDocumentClient.mockReturnValue(
      {} as ReturnType<typeof getDynamoDBDocumentClient>
    );
  });

  const createRequest = (body: unknown): Request =>
    ({
      json: async () => body,
    }) as Request;

  it('正常系: 時間更新時は clipStatus を PENDING にして返す', async () => {
    mockGetById
      .mockResolvedValueOnce({
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        status: 'pending',
        clipStatus: 'PENDING',
      })
      .mockResolvedValueOnce({
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 11,
        endSec: 21,
        status: 'accepted',
        clipStatus: 'PENDING',
      });
    mockUpdate.mockResolvedValueOnce({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 11,
      endSec: 21,
      status: 'accepted',
      clipStatus: 'PENDING',
    });

    const request = createRequest({
      startSec: 11,
      endSec: 21,
      status: 'accepted',
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        highlightId: 'h1',
        status: 'accepted',
        clipStatus: 'PENDING',
      })
    );
  });

  it('正常系: 時間変更なしの更新は通常更新する', async () => {
    mockGetById.mockResolvedValue({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      status: 'pending',
    });
    mockUpdate.mockResolvedValue({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 11,
      endSec: 21,
      status: 'accepted',
      clipStatus: 'PENDING',
    });

    const request = createRequest({
      status: 'accepted',
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        highlightId: 'h1',
        status: 'accepted',
      })
    );
  });

  it('異常系: 不正なレンジは400を返す', async () => {
    const request = createRequest({
      startSec: 30,
      endSec: 20,
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_REQUEST',
      message: '更新内容が不正です',
    });
  });
});
