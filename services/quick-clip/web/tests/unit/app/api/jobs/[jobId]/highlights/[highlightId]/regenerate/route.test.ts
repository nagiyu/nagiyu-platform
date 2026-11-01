/**
 * @jest-environment node
 */

import { reportErrorEvent } from '@nagiyu/aws';
import { POST } from '@/app/api/jobs/[jobId]/highlights/[highlightId]/regenerate/route';
import type { HighlightRepository } from '@nagiyu/quick-clip-core';
import { getLambdaClient } from '@/lib/server/aws';

const mockGetById = jest.fn();
const mockUpdate = jest.fn();
const lambdaSend = jest.fn();

jest.mock('@nagiyu/quick-clip-core', () => ({
  ...jest.requireActual('@nagiyu/quick-clip-core'),
  createHighlightRepository: jest.fn().mockImplementation(
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
  getLambdaClient: jest.fn(() => ({
    send: lambdaSend,
  })),
  getClipRegenerateFunctionName: jest.fn(() => 'clip-regenerate'),
}));

describe('POST /api/jobs/[jobId]/highlights/[highlightId]/regenerate', () => {
  const mockedGetLambdaClient = getLambdaClient as jest.MockedFunction<typeof getLambdaClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetLambdaClient.mockReturnValue({
      send: lambdaSend.mockResolvedValue({}),
    } as unknown as ReturnType<typeof getLambdaClient>);
  });

  it('正常系: Lambda 非同期実行の前に clipStatus を GENERATING (と開始時刻) へ更新して返す', async () => {
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

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000123456);
    let response: Awaited<ReturnType<typeof POST>>;
    try {
      response = await POST({} as Request, {
        params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
      });
    } finally {
      nowSpy.mockRestore();
    }
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('job-1', 'h1', {
      clipStatus: 'GENERATING',
      clipGeneratingStartedAt: 1700000123456,
    });
    expect(mockUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      lambdaSend.mock.invocationCallOrder[0]
    );
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
    expect(reportErrorEvent).not.toHaveBeenCalled();
  });

  it('異常系: 想定外のエラーは500を返し報告する', async () => {
    mockGetById.mockResolvedValue({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      status: 'accepted',
      clipStatus: 'PENDING',
    });
    mockUpdate
      .mockResolvedValueOnce({ highlightId: 'h1', clipStatus: 'GENERATING' })
      .mockResolvedValueOnce({ highlightId: 'h1', clipStatus: 'FAILED' });
    lambdaSend.mockRejectedValueOnce(new Error('invoke failed'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST({} as Request, {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'クリップ再生成の開始に失敗しました',
    });
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'error',
        title: 'Web API: クリップ再生成開始エラー',
      })
    );
    consoleErrorSpy.mockRestore();
  });

  it('異常系: Lambda 起動に失敗したら FAILED に戻してから 500 を返す', async () => {
    mockGetById.mockResolvedValue({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      status: 'accepted',
      clipStatus: 'FAILED',
    });
    mockUpdate
      .mockResolvedValueOnce({ highlightId: 'h1', clipStatus: 'GENERATING' })
      .mockResolvedValueOnce({ highlightId: 'h1', clipStatus: 'FAILED' });
    lambdaSend.mockRejectedValueOnce(new Error('invoke failed'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST({} as Request, {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
    });

    expect(response.status).toBe(500);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenLastCalledWith('job-1', 'h1', { clipStatus: 'FAILED' });
    consoleErrorSpy.mockRestore();
  });

  it('異常系: GENERATING の見どころは 409 を返し、更新も Lambda 起動もしない', async () => {
    mockGetById.mockResolvedValue({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      status: 'accepted',
      clipStatus: 'GENERATING',
      clipGeneratingStartedAt: 1700000000000,
    });

    const response = await POST({} as Request, {
      params: Promise.resolve({ jobId: 'job-1', highlightId: 'h1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: 'CLIP_GENERATING',
      message: 'クリップを作り直している最中のため、変更できません',
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(lambdaSend).not.toHaveBeenCalled();
  });
});
