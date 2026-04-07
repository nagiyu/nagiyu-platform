import { PATCH } from '@/app/api/jobs/[jobId]/highlights/[highlightId]/route';
import type { HighlightRepository } from '@nagiyu/quick-clip-core';
import {
  getDynamoDBDocumentClient,
  getClipRegenerateFunctionName,
  getLambdaClient,
} from '@/lib/server/aws';
import { InvokeCommand } from '@aws-sdk/client-lambda';

const mockUpdate = jest.fn();
const mockGetById = jest.fn();
const mockLambdaSend = jest.fn();

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
  getClipRegenerateFunctionName: jest.fn(() => 'clip-regenerate'),
  getLambdaClient: jest.fn(() => ({ send: jest.fn() })),
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  InvokeCommand: jest.fn().mockImplementation((input: unknown) => input),
}));

describe('PATCH /api/jobs/[jobId]/highlights/[highlightId]', () => {
  const mockedGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<
    typeof getDynamoDBDocumentClient
  >;
  const mockedGetLambdaClient = getLambdaClient as jest.MockedFunction<typeof getLambdaClient>;
  const mockedGetClipRegenerateFunctionName = getClipRegenerateFunctionName as jest.MockedFunction<
    typeof getClipRegenerateFunctionName
  >;
  const mockedInvokeCommand = InvokeCommand as jest.MockedFunction<typeof InvokeCommand>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDynamoDBDocumentClient.mockReturnValue(
      {} as ReturnType<typeof getDynamoDBDocumentClient>
    );
    mockedGetLambdaClient.mockReturnValue({
      send: mockLambdaSend,
    } as ReturnType<typeof getLambdaClient>);
    mockedGetClipRegenerateFunctionName.mockReturnValue('clip-regenerate');
    mockLambdaSend.mockResolvedValue({});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const createRequest = (body: unknown): Request =>
    ({
      json: async () => body,
    }) as Request;

  it('正常系: 時間更新時は clipStatus を GENERATING にして Lambda を起動する', async () => {
    mockGetById
      .mockResolvedValueOnce({
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        source: 'motion',
        status: 'unconfirmed',
        clipStatus: 'GENERATED',
      })
      .mockResolvedValueOnce({
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 11,
        endSec: 21,
        source: 'motion',
        status: 'unconfirmed',
        clipStatus: 'GENERATING',
      });
    mockUpdate.mockResolvedValueOnce({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 11,
      endSec: 21,
      source: 'motion',
      status: 'unconfirmed',
      clipStatus: 'GENERATING',
    });

    const request = createRequest({
      startSec: 11,
      endSec: 21,
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        highlightId: 'h1',
        status: 'unconfirmed',
        clipStatus: 'GENERATING',
      })
    );
    expect(mockLambdaSend).toHaveBeenCalledTimes(1);
    expect(mockedInvokeCommand).toHaveBeenCalledWith(
      expect.objectContaining({ FunctionName: 'clip-regenerate', InvocationType: 'Event' })
    );
  });

  it('正常系: 時間更新時に status が accepted の場合は unconfirmed にリセットする', async () => {
    mockGetById
      .mockResolvedValueOnce({
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        source: 'motion',
        status: 'accepted',
        clipStatus: 'GENERATED',
      })
      .mockResolvedValueOnce({
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 11,
        endSec: 21,
        source: 'motion',
        status: 'unconfirmed',
        clipStatus: 'GENERATING',
      });
    mockUpdate.mockResolvedValueOnce({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 11,
      endSec: 21,
      source: 'motion',
      status: 'unconfirmed',
      clipStatus: 'GENERATING',
    });

    const request = createRequest({
      startSec: 11,
      endSec: 21,
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        highlightId: 'h1',
        status: 'unconfirmed',
        clipStatus: 'GENERATING',
      })
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      'job-1',
      'h1',
      expect.objectContaining({ status: 'unconfirmed', clipStatus: 'GENERATING' })
    );
  });

  it('正常系: 時間更新時に status が rejected の場合は unconfirmed にリセットする', async () => {
    mockGetById
      .mockResolvedValueOnce({
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        source: 'volume',
        status: 'rejected',
        clipStatus: 'GENERATED',
      })
      .mockResolvedValueOnce({
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 11,
        endSec: 21,
        source: 'volume',
        status: 'unconfirmed',
        clipStatus: 'GENERATING',
      });
    mockUpdate.mockResolvedValueOnce({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 11,
      endSec: 21,
      source: 'volume',
      status: 'unconfirmed',
      clipStatus: 'GENERATING',
    });

    const request = createRequest({
      startSec: 11,
      endSec: 21,
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      'job-1',
      'h1',
      expect.objectContaining({ status: 'unconfirmed', clipStatus: 'GENERATING' })
    );
  });

  it('正常系: 時間変更なしの更新は通常更新する', async () => {
    mockGetById.mockResolvedValue({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      source: 'motion',
      status: 'unconfirmed',
      clipStatus: 'PENDING',
    });
    mockUpdate.mockResolvedValue({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      source: 'motion',
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
    expect(mockLambdaSend).not.toHaveBeenCalled();
  });

  it('正常系: Lambda 起動失敗時も更新結果を返す', async () => {
    mockGetById
      .mockResolvedValueOnce({
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        source: 'motion',
        status: 'unconfirmed',
        clipStatus: 'PENDING',
      })
      .mockResolvedValueOnce({
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 11,
        endSec: 21,
        source: 'motion',
        status: 'unconfirmed',
        clipStatus: 'GENERATING',
      });
    mockUpdate.mockResolvedValueOnce({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 11,
      endSec: 21,
      source: 'motion',
      status: 'unconfirmed',
      clipStatus: 'GENERATING',
    });
    mockLambdaSend.mockRejectedValueOnce(new Error('invoke failed'));

    const request = createRequest({ startSec: 11, endSec: 21 });

    const response = await PATCH(request, {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ highlightId: 'h1', clipStatus: 'GENERATING' }));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[PATCH /api/jobs/[jobId]/highlights/[highlightId]] クリップ再生成の起動に失敗しました',
      expect.objectContaining({ jobId: 'job-1', highlightId: 'h1', error: expect.any(Error) })
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

  it('異常系: 見どころが存在しない場合は404を返す', async () => {
    mockGetById.mockResolvedValueOnce(null);

    const request = createRequest({ startSec: 11, endSec: 21 });

    const response = await PATCH(request, {
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
