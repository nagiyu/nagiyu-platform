import { POST } from '@/app/api/jobs/[jobId]/highlights/[highlightId]/regenerate/route';
import type { HighlightRepository } from '@nagiyu/quick-clip-core';
import { getDynamoDBDocumentClient, getLambdaClient } from '@/lib/server/aws';

const mockGetById = jest.fn();
const mockUpdate = jest.fn();
const lambdaSend = jest.fn();

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
    send: lambdaSend,
  })),
  getClipRegenerateFunctionName: jest.fn(() => 'clip-regenerate'),
  getTableName: jest.fn(() => 'test-table'),
}));

describe('POST /api/jobs/[jobId]/highlights/[highlightId]/regenerate', () => {
  const mockedGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<
    typeof getDynamoDBDocumentClient
  >;
  const mockedGetLambdaClient = getLambdaClient as jest.MockedFunction<typeof getLambdaClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDynamoDBDocumentClient.mockReturnValue(
      {} as ReturnType<typeof getDynamoDBDocumentClient>
    );
    mockedGetLambdaClient.mockReturnValue({
      send: lambdaSend.mockResolvedValue({}),
    } as ReturnType<typeof getLambdaClient>);
  });

  it('正常系: Lambda 非同期実行後に clipStatus を GENERATING へ更新して返す', async () => {
    mockGetById.mockResolvedValue({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      status: 'accepted',
      clipStatus: 'PENDING',
    });
    mockUpdate.mockResolvedValue({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      status: 'accepted',
      clipStatus: 'GENERATING',
    });

    const response = await POST({} as Request, {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(lambdaSend).toHaveBeenCalledTimes(1);
    expect(body).toEqual(
      expect.objectContaining({
        highlightId: 'h1',
        clipStatus: 'GENERATING',
      })
    );
  });

  it('異常系: highlight が存在しない場合は 404 を返す', async () => {
    mockGetById.mockResolvedValue(null);

    const response = await POST({} as Request, {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'missing' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: 'HIGHLIGHT_NOT_FOUND',
      message: '指定された見どころが見つかりません',
    });
  });
});
