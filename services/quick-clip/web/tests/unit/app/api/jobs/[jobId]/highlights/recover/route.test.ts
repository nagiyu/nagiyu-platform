import { reportErrorEvent } from '@nagiyu/aws';
import { POST } from '@/app/api/jobs/[jobId]/highlights/recover/route';
import type { HighlightRepository, JobRepository } from '@nagiyu/quick-clip-core';
import { getDynamoDBDocumentClient } from '@/lib/server/aws';
import { CLIP_GENERATING_STALE_MS } from '@/lib/server/highlight-recovery';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/server/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
}));

const mockGetJob = jest.fn();
const mockGetHighlights = jest.fn();
const mockGetHighlightById = jest.fn();
const mockUpdateHighlight = jest.fn();
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
  DynamoDBHighlightRepository: jest.fn().mockImplementation(
    () =>
      ({
        getByJobId: mockGetHighlights,
        getById: mockGetHighlightById,
        update: mockUpdateHighlight,
      }) as unknown as HighlightRepository
  ),
}));

const NOW = 1700000000000;

const buildHighlight = (highlightId: string, overrides: Record<string, unknown> = {}) => ({
  highlightId,
  jobId: 'job-1',
  order: 1,
  startSec: 10,
  endSec: 20,
  source: 'motion',
  status: 'unconfirmed',
  clipStatus: 'GENERATING',
  ...overrides,
});

describe('POST /api/jobs/[jobId]/highlights/recover', () => {
  const mockedGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<
    typeof getDynamoDBDocumentClient
  >;
  let nowSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDynamoDBDocumentClient.mockReturnValue(
      {} as ReturnType<typeof getDynamoDBDocumentClient>
    );
    mockGetJob.mockResolvedValue({ jobId: 'job-1' });
    mockGetHighlightById.mockImplementation(async (_jobId: string, highlightId: string) =>
      buildHighlight(highlightId)
    );
    mockUpdateHighlight.mockResolvedValue({});
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  const callPost = (jobId = 'job-1') => POST({} as Request, { params: Promise.resolve({ jobId }) });

  it('正常系: 360 秒を過ぎた GENERATING だけを FAILED にし、その ID を返す', async () => {
    mockGetHighlights.mockResolvedValue([
      buildHighlight('stuck', { clipGeneratingStartedAt: NOW - CLIP_GENERATING_STALE_MS - 1 }),
      buildHighlight('boundary', { clipGeneratingStartedAt: NOW - CLIP_GENERATING_STALE_MS }),
      buildHighlight('running', { clipGeneratingStartedAt: NOW - 1000 }),
      buildHighlight('legacy'),
      buildHighlight('done', {
        clipStatus: 'GENERATED',
        clipGeneratingStartedAt: NOW - CLIP_GENERATING_STALE_MS * 2,
      }),
    ]);

    const response = await callPost();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ recoveredHighlightIds: ['stuck'] });
    expect(mockUpdateHighlight).toHaveBeenCalledTimes(1);
    expect(mockUpdateHighlight).toHaveBeenCalledWith('job-1', 'stuck', { clipStatus: 'FAILED' });
  });

  it('正常系: 該当する見どころが無ければ何も更新せず空配列を返す', async () => {
    mockGetHighlights.mockResolvedValue([buildHighlight('legacy')]);

    const response = await callPost();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ recoveredHighlightIds: [] });
    expect(mockUpdateHighlight).not.toHaveBeenCalled();
  });

  it('異常系: ジョブが存在しない場合は 404 を返す', async () => {
    mockGetJob.mockResolvedValue(null);

    const response = await callPost('missing');
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual(expect.objectContaining({ error: 'JOB_NOT_FOUND' }));
    expect(mockGetHighlights).not.toHaveBeenCalled();
    expect(mockUpdateHighlight).not.toHaveBeenCalled();
  });

  it('異常系: 想定外のエラーは500を返し報告する', async () => {
    mockGetHighlights.mockRejectedValue(new Error('db failed'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await callPost();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: '見どころの復旧に失敗しました',
    });
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'error',
        title: 'Web API: 見どころ復旧エラー',
      })
    );
    consoleErrorSpy.mockRestore();
  });
});
