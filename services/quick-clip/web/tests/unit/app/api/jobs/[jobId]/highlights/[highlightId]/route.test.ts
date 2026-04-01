import { PATCH } from '@/app/api/jobs/[jobId]/highlights/[highlightId]/route';
import type { HighlightRepository } from '@nagiyu/quick-clip-core';
import { getDynamoDBDocumentClient, getLambdaClient } from '@/lib/server/aws';

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
  getLambdaClient: jest.fn(() => ({
    send: jest.fn(),
  })),
  getClipRegenerateFunctionName: jest.fn(() => 'clip-regenerate'),
  getTableName: jest.fn(() => 'test-table'),
}));

describe('PATCH /api/jobs/[jobId]/highlights/[highlightId]', () => {
  const mockedGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<
    typeof getDynamoDBDocumentClient
  >;
  const mockedGetLambdaClient = getLambdaClient as jest.MockedFunction<typeof getLambdaClient>;
  const lambdaSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDynamoDBDocumentClient.mockReturnValue(
      {} as ReturnType<typeof getDynamoDBDocumentClient>
    );
    mockedGetLambdaClient.mockReturnValue({
      send: lambdaSend.mockResolvedValue({}),
    } as ReturnType<typeof getLambdaClient>);
  });

  const createRequest = (body: unknown): Request =>
    ({
      json: async () => body,
    }) as Request;

  it('正常系: 見どころ更新結果を返す', async () => {
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
    mockUpdate
      .mockResolvedValueOnce({
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 11,
        endSec: 21,
        status: 'accepted',
        clipStatus: 'PENDING',
      })
      .mockResolvedValueOnce({
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 11,
        endSec: 21,
        status: 'accepted',
        clipStatus: 'GENERATING',
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
        clipStatus: 'GENERATING',
      })
    );
    expect(lambdaSend).toHaveBeenCalledTimes(1);
  });

  it('正常系: 時間変更なしの更新は Lambda を呼ばない', async () => {
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
    expect(lambdaSend).not.toHaveBeenCalled();
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
