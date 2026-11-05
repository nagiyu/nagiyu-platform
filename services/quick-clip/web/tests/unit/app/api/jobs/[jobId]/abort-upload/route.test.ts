/**
 * @jest-environment node
 */

import { reportErrorEvent } from '@nagiyu/aws';
import { createJobRepository, resetInMemoryRepositories } from '@nagiyu/quick-clip-core';
import { getS3Client } from '@/lib/server/aws';
import { createUsageService } from '@/lib/server/usage-context';
import { POST } from '@/app/api/jobs/[jobId]/abort-upload/route';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/server/aws', () => ({
  getBucketName: jest.fn(() => 'test-bucket'),
  getS3Client: jest.fn(),
}));

// セッションの検証 (next-auth) を読み込まないため差し替える。利用回数の戻しはセッションを使わない
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

describe('POST /api/jobs/[jobId]/abort-upload', () => {
  const mockedGetS3Client = getS3Client as jest.MockedFunction<typeof getS3Client>;
  const s3Send = jest.fn();
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_IN_MEMORY_DB = 'true';
    resetInMemoryRepositories();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetS3Client.mockReturnValue({
      send: s3Send.mockResolvedValue({}),
    } as unknown as ReturnType<typeof getS3Client>);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.USE_IN_MEMORY_DB;
  });

  const createJobWithUsage = async (overrides: { batchJobId?: string } = {}): Promise<void> => {
    const consumed = await createUsageService().consume({
      subject: 'USER#u1',
      tier: 'free',
      aiAnalysis: false,
    });
    if (!consumed.ok) {
      throw new Error('数えられるはず');
    }
    await createJobRepository().create({
      jobId: 'job-1',
      originalFileName: 'movie.mp4',
      fileSize: 1,
      createdAt: 1,
      expiresAt: 2,
      usage: consumed.record,
      ...overrides,
    });
  };

  const getUsed = async (): Promise<{ ai: number; noAi: number }> =>
    (await createUsageService().getUsage('USER#u1', 'free')).used;

  const createRequest = (body: unknown): Request =>
    ({
      json: async () => body,
    }) as Request;

  it('正常系: AbortMultipartUploadを呼び出し200を返す', async () => {
    const response = await POST(createRequest({ uploadId: 'upload-1' }), {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({});
    expect(s3Send).toHaveBeenCalledTimes(1);
  });

  it('正常系: アップロードをやめたジョブの利用回数を戻す。二重には戻さない', async () => {
    await createJobWithUsage();

    await POST(createRequest({ uploadId: 'upload-1' }), {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    await POST(createRequest({ uploadId: 'upload-1' }), {
      params: Promise.resolve({ jobId: 'job-1' }),
    });

    expect(await getUsed()).toEqual({ ai: 0, noAi: 0 });
  });

  it('正常系: Batch に投入済みのジョブの利用回数は戻さない', async () => {
    await createJobWithUsage({ batchJobId: 'batch-1' });

    await POST(createRequest({ uploadId: 'upload-1' }), {
      params: Promise.resolve({ jobId: 'job-1' }),
    });

    expect(await getUsed()).toEqual({ ai: 0, noAi: 1 });
  });

  it('正常系: ジョブが無くても中断は成功する', async () => {
    const response = await POST(createRequest({ uploadId: 'upload-1' }), {
      params: Promise.resolve({ jobId: 'missing' }),
    });

    expect(response.status).toBe(200);
  });

  it('異常系: リクエストボディが不正な場合は400を返す', async () => {
    const response = await POST(createRequest({ uploadId: '' }), {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_REQUEST',
      message: 'リクエストが不正です',
    });
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('異常系: uploadIdがない場合は400を返す', async () => {
    const response = await POST(createRequest({}), {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_REQUEST',
      message: 'リクエストが不正です',
    });
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('異常系: AbortMultipartUpload失敗時は500を返す', async () => {
    const abortError = new Error('abort failed');
    s3Send.mockRejectedValueOnce(abortError);

    const response = await POST(createRequest({ uploadId: 'upload-1' }), {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'アップロード中断処理に失敗しました',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Web API: アップロード中断エラー]', abortError);
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'error',
        title: 'Web API: アップロード中断エラー',
      })
    );
  });

  const createBrokenJsonRequest = (): Request =>
    ({
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    }) as unknown as Request;

  it.each([
    ['壊れた JSON', () => createBrokenJsonRequest()],
    ['null', () => createRequest(null)],
    ['配列', () => createRequest([{ uploadId: 'upload-1' }])],
    ['文字列', () => createRequest('upload-1')],
    ['uploadId が数値', () => createRequest({ uploadId: 1 })],
    ['uploadId が null', () => createRequest({ uploadId: null })],
  ])('異常系: %s の場合は 400 を返し、S3 を呼ばない', async (_label, buildRequest) => {
    const response = await POST(buildRequest(), {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_REQUEST',
      message: 'リクエストが不正です',
    });
    expect(s3Send).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
