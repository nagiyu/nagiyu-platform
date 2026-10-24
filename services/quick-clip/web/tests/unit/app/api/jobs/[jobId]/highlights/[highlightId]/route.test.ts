import { reportErrorEvent } from '@nagiyu/aws';
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

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
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
  const mockedInvokeCommand = InvokeCommand as jest.MockedClass<typeof InvokeCommand>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDynamoDBDocumentClient.mockReturnValue(
      {} as ReturnType<typeof getDynamoDBDocumentClient>
    );
    mockedGetLambdaClient.mockReturnValue({
      send: mockLambdaSend,
    } as unknown as ReturnType<typeof getLambdaClient>);
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

  it('正常系: Lambda 起動失敗時は clipStatus を FAILED に更新して返し、通報する', async () => {
    const base = {
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      source: 'motion',
      status: 'unconfirmed',
    };
    mockGetById.mockResolvedValue({
      ...base,
      startSec: 10,
      endSec: 20,
      clipStatus: 'PENDING',
    });
    mockUpdate
      .mockResolvedValueOnce({ ...base, startSec: 11, endSec: 21, clipStatus: 'GENERATING' })
      .mockResolvedValueOnce({ ...base, startSec: 11, endSec: 21, clipStatus: 'FAILED' });
    mockLambdaSend.mockRejectedValueOnce(new Error('invoke failed'));

    const request = createRequest({ startSec: 11, endSec: 21 });

    const response = await PATCH(request, {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ highlightId: 'h1', clipStatus: 'FAILED' }));
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenLastCalledWith('job-1', 'h1', { clipStatus: 'FAILED' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[PATCH /api/jobs/[jobId]/highlights/[highlightId]] クリップ再生成の起動に失敗しました',
      expect.objectContaining({ jobId: 'job-1', highlightId: 'h1', error: expect.any(Error) })
    );
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'error',
        title: 'Web API: クリップ再生成起動エラー',
      })
    );
  });

  it('異常系: Lambda 起動失敗後の FAILED への更新も失敗した場合は 500 を返す', async () => {
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
    mockUpdate
      .mockResolvedValueOnce({ highlightId: 'h1', clipStatus: 'GENERATING' })
      .mockRejectedValueOnce(new Error('db failed'));
    mockLambdaSend.mockRejectedValueOnce(new Error('invoke failed'));

    const response = await PATCH(createRequest({ startSec: 11, endSec: 21 }), {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
    });

    expect(response.status).toBe(500);
  });

  describe('作り直し中 (GENERATING) の見どころ', () => {
    const generating = {
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      source: 'motion',
      status: 'unconfirmed',
      clipStatus: 'GENERATING',
      clipGeneratingStartedAt: 1700000000000,
    };

    it.each([
      ['startSec と endSec', { startSec: 11, endSec: 21 }],
      ['startSec のみ', { startSec: 11 }],
      ['endSec のみ', { endSec: 21 }],
    ])('異常系: %s の変更は 409 を返し、更新も Lambda 起動もしない', async (_label, request) => {
      mockGetById.mockResolvedValue(generating);

      const response = await PATCH(createRequest(request), {
        params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
      });
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body).toEqual({
        error: 'CLIP_GENERATING',
        message: 'クリップを作り直している最中のため、変更できません',
      });
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockLambdaSend).not.toHaveBeenCalled();
    });

    it('正常系: status だけの更新は従来どおり受け付ける', async () => {
      mockGetById.mockResolvedValue(generating);
      mockUpdate.mockResolvedValue({ ...generating, status: 'accepted' });

      const response = await PATCH(createRequest({ status: 'accepted' }), {
        params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
      });

      expect(response.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith('job-1', 'h1', { status: 'accepted' });
      expect(mockLambdaSend).not.toHaveBeenCalled();
    });
  });

  it('正常系: GENERATING にするとき、その時刻 (clipGeneratingStartedAt) も保存する', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000123456);
    try {
      mockGetById.mockResolvedValue({
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        source: 'motion',
        status: 'unconfirmed',
        clipStatus: 'GENERATED',
      });
      mockUpdate.mockResolvedValue({ highlightId: 'h1', clipStatus: 'GENERATING' });

      const response = await PATCH(createRequest({ startSec: 11, endSec: 21 }), {
        params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
      });

      expect(response.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith('job-1', 'h1', {
        startSec: 11,
        endSec: 21,
        clipStatus: 'GENERATING',
        clipGeneratingStartedAt: 1700000123456,
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('異常系: 想定外のエラーは500を返し報告する', async () => {
    mockGetById.mockRejectedValueOnce(new Error('db failed'));

    const response = await PATCH(createRequest({ startSec: 11, endSec: 21 }), {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: '見どころの更新に失敗しました',
    });
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'error',
        title: 'Web API: 見どころ更新エラー',
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

  const createBrokenJsonRequest = (): Request =>
    ({
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    }) as unknown as Request;

  describe('不正なリクエストボディ', () => {
    it.each([
      ['壊れた JSON', () => createBrokenJsonRequest()],
      ['null', () => createRequest(null)],
      ['配列', () => createRequest([{ startSec: 1 }])],
      ['文字列', () => createRequest('accepted')],
      ['startSec が文字列', () => createRequest({ startSec: '10' })],
      ['endSec が null', () => createRequest({ endSec: null })],
      ['status が範囲外の値', () => createRequest({ status: 'unknown' })],
      ['status が数値', () => createRequest({ status: 1 })],
    ])(
      '異常系: %s の場合は 400 を返し、更新も Lambda 起動もしない',
      async (_label, buildRequest) => {
        const response = await PATCH(buildRequest(), {
          params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
        });
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body).toEqual({
          error: 'INVALID_REQUEST',
          message: '更新内容が不正です',
        });
        expect(mockGetById).not.toHaveBeenCalled();
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(mockLambdaSend).not.toHaveBeenCalled();
      }
    );

    it('更新対象外の項目 (clipStatus など) は更新内容に含めない', async () => {
      mockGetById.mockResolvedValue({
        jobId: 'job-1',
        highlightId: 'h1',
        startSec: 10,
        endSec: 20,
        status: 'unconfirmed',
        clipStatus: 'GENERATED',
      });
      mockUpdate.mockResolvedValue({ highlightId: 'h1', status: 'accepted' });

      const response = await PATCH(createRequest({ status: 'accepted', clipStatus: 'FAILED' }), {
        params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
      });

      expect(response.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith('job-1', 'h1', { status: 'accepted' });
    });
  });
});
