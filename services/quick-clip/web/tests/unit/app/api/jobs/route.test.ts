/**
 * @jest-environment node
 */

import {
  createErrorEventWriter,
  reportErrorEvent,
  resetErrorEventWriter,
  type InMemoryErrorEventWriter,
} from '@nagiyu/aws';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  buildAnonymousSubject,
  createJobRepository,
  createUsageRepository,
  USAGE_LIMITS,
  resetInMemoryRepositories,
} from '@nagiyu/quick-clip-core';
import { createUsageService } from '@/lib/server/usage-context';
import { getBatchClient, getS3Client } from '@/lib/server/aws';
import { POST } from '@/app/api/jobs/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth', () => ({
  getSession: () => mockGetSession(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      headers: new Headers(init?.headers),
      json: async () => body,
    }),
  },
}));

const FREE_SESSION = {
  user: { id: 'user-1', email: 'a@example.com', name: 'A', roles: [] },
  expires: '2999-01-01T00:00:00.000Z',
};
const STANDARD_SESSION = {
  user: { ...FREE_SESSION.user, roles: ['quick-clip-standard'] },
  expires: '2999-01-01T00:00:00.000Z',
};
const ANON_ID = '11111111-1111-4111-8111-111111111111';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('@/lib/server/aws', () => ({
  getBatchClient: jest.fn(),
  getBatchJobDefinitionPrefix: jest.fn(() => 'nagiyu-quick-clip-dev'),
  getBatchJobQueueArn: jest.fn(() => 'arn:aws:batch:us-east-1:123456789012:job-queue/quick-clip'),
  getBucketName: jest.fn(() => 'test-bucket'),
  getS3Client: jest.fn(() => ({})),
}));

jest.mock('@nagiyu/quick-clip-core', () => ({
  ...jest.requireActual('@nagiyu/quick-clip-core'),
}));

describe('POST /api/jobs', () => {
  const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;
  const mockedGetBatchClient = getBatchClient as jest.MockedFunction<typeof getBatchClient>;
  const mockedGetS3Client = getS3Client as jest.MockedFunction<typeof getS3Client>;
  const batchSend = jest.fn();
  const s3Send = jest.fn();
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_IN_MEMORY_DB = 'true';
    process.env.ERROR_EVENTS_TABLE_NAME = 'test-error-events';
    resetErrorEventWriter();
    resetInMemoryRepositories();
    mockGetSession.mockResolvedValue(FREE_SESSION);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetSignedUrl.mockResolvedValue('https://example.com/upload');
    mockedGetBatchClient.mockReturnValue({
      send: batchSend.mockResolvedValue({ jobId: 'batch-job-1' }),
    } as unknown as ReturnType<typeof getBatchClient>);
    mockedGetS3Client.mockReturnValue({
      send: s3Send.mockResolvedValue({ UploadId: 'upload-id-1' }),
    } as unknown as ReturnType<typeof getS3Client>);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.ERROR_EVENTS_TABLE_NAME;
    resetErrorEventWriter();
  });

  const createRequest = (body: unknown, headers: Record<string, string> = {}): Request =>
    ({
      json: async () => body,
      headers: new Headers(headers),
    }) as Request;

  const validBody = { fileName: 'movie.mp4', fileSize: 1024, contentType: 'video/mp4' };

  it('正常系: ジョブ作成・Presigned URL生成・Batch投入を行う', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 1024,
      contentType: 'video/mp4',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual(
      expect.objectContaining({
        jobId: expect.any(String),
        uploadUrl: 'https://example.com/upload',
        expiresIn: 3600,
      })
    );
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1);
    expect(batchSend).toHaveBeenCalledTimes(1);
    expect(batchSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          jobDefinition: 'nagiyu-quick-clip-dev-small',
        }),
      })
    );
  });

  it('異常系: MP4以外のファイルは400を返す', async () => {
    const request = createRequest({
      fileName: 'movie.mov',
      fileSize: 1024,
      contentType: 'video/quicktime',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_FILE_TYPE',
      message: 'MP4 形式の動画ファイルのみアップロードできます',
    });
  });

  it('正常系: 100MB以上のファイルはマルチパートアップロードURLを返す', async () => {
    const partUrls = Array.from(
      { length: 2 },
      (_, index) => `https://example.com/upload-part-${index + 1}`
    );
    partUrls.forEach((url) => {
      mockedGetSignedUrl.mockResolvedValueOnce(url);
    });
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 100 * 1024 * 1024,
      contentType: 'video/mp4',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual(
      expect.objectContaining({
        jobId: expect.any(String),
        multipart: {
          uploadId: 'upload-id-1',
          uploadUrls: partUrls,
          chunkSize: 50 * 1024 * 1024,
        },
        expiresIn: 24 * 60 * 60,
      })
    );
    expect(s3Send).toHaveBeenCalledTimes(1);
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(2);
    expect(batchSend).not.toHaveBeenCalled();
  });

  it('正常系: 20GBちょうどのファイルは410パートのURLを返す', async () => {
    const partUrls = Array.from(
      { length: 410 },
      (_, index) => `https://example.com/upload-part-${index + 1}`
    );
    partUrls.forEach((url) => {
      mockedGetSignedUrl.mockResolvedValueOnce(url);
    });
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 20 * 1024 * 1024 * 1024,
      contentType: 'video/mp4',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual(
      expect.objectContaining({
        multipart: expect.objectContaining({
          uploadUrls: partUrls,
          chunkSize: 50 * 1024 * 1024,
        }),
      })
    );
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(410);
    expect(batchSend).not.toHaveBeenCalled();
  });

  it('異常系: 20GB超過のファイルは400を返す', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 20 * 1024 * 1024 * 1024 + 1,
      contentType: 'video/mp4',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_FILE_SIZE',
      message: 'ファイルサイズが不正です',
    });
  });

  it('異常系: マルチパートURL生成で例外が発生した場合は500を返す', async () => {
    mockedGetSignedUrl.mockRejectedValueOnce(new Error('sign failed'));
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 100 * 1024 * 1024,
      contentType: 'video/mp4',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'ジョブの作成に失敗しました',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Web API: ジョブ作成エラー]', expect.any(Error));
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'error',
        title: 'Web API: ジョブ作成エラー',
      })
    );
  });

  it('異常系: マルチパートアップロード作成に失敗した場合は500を返す', async () => {
    s3Send.mockRejectedValueOnce(new Error('create multipart failed'));
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 100 * 1024 * 1024,
      contentType: 'video/mp4',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'ジョブの作成に失敗しました',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Web API: ジョブ作成エラー]', expect.any(Error));
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'error',
        title: 'Web API: ジョブ作成エラー',
      })
    );
  });

  it('異常系: Batchジョブ作成に失敗した場合は500を返しエラーログを出力する', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 1024,
      contentType: 'video/mp4',
    });
    const batchError = new Error('submit failed');
    batchSend.mockRejectedValueOnce(batchError);

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'ジョブの作成に失敗しました',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Web API: ジョブ作成エラー]', batchError);
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'error',
        title: 'Web API: ジョブ作成エラー',
      })
    );
  });

  it('正常系: emotionFilter未指定時はBatch envにEMOTION_FILTER=anyが設定される', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 1024,
      contentType: 'video/mp4',
    });

    await POST(request);

    expect(batchSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          containerOverrides: expect.objectContaining({
            environment: expect.arrayContaining([{ name: 'EMOTION_FILTER', value: 'any' }]),
          }),
        }),
      })
    );
  });

  it('正常系: emotionFilter指定時はBatch envに反映される', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 1024,
      contentType: 'video/mp4',
      emotionFilter: 'laugh',
    });

    await POST(request);

    expect(batchSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          containerOverrides: expect.objectContaining({
            environment: expect.arrayContaining([{ name: 'EMOTION_FILTER', value: 'laugh' }]),
          }),
        }),
      })
    );
  });

  it('正常系: Batch envには起動ごとの値だけを渡し、ジョブ定義の値は上書きしない', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 1024,
      contentType: 'video/mp4',
    });

    await POST(request);

    const command = batchSend.mock.calls[0][0] as {
      input: { containerOverrides: { environment: { name: string }[] } };
    };
    expect(command.input.containerOverrides.environment.map((entry) => entry.name)).toEqual([
      'BATCH_COMMAND',
      'JOB_ID',
      'EMOTION_FILTER',
      'AI_ANALYSIS',
    ]);
  });

  it('異常系: 不正なemotionFilterは400を返す', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 1024,
      contentType: 'video/mp4',
      emotionFilter: 'invalid',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_REQUEST',
      message: 'リクエストが不正です',
    });
  });

  it('正常系: durationSec指定時に尺軸でジョブ定義が昇格する', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 1024,
      contentType: 'video/mp4',
      durationSec: 7200,
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(batchSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          jobDefinition: 'nagiyu-quick-clip-dev-large',
        }),
      })
    );
  });

  it('異常系: durationSecが数値以外の場合は400を返す', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 1024,
      contentType: 'video/mp4',
      durationSec: '7200',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_REQUEST',
      message: 'リクエストが不正です',
    });
  });

  it('異常系: durationSecが0以下の場合は400を返す', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 1024,
      contentType: 'video/mp4',
      durationSec: 0,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_DURATION',
      message: '動画の再生時間が不正です',
    });
    expect(batchSend).not.toHaveBeenCalled();
  });

  it('異常系: durationSecが上限(86400秒)超過の場合は400を返す', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 1024,
      contentType: 'video/mp4',
      durationSec: 24 * 60 * 60 + 1,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_DURATION',
      message: '動画の再生時間が不正です',
    });
  });

  it('異常系: durationSecがNaNの場合は400を返す', async () => {
    const request = createRequest({
      fileName: 'movie.mp4',
      fileSize: 1024,
      contentType: 'video/mp4',
      durationSec: Number.NaN,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_DURATION',
      message: '動画の再生時間が不正です',
    });
  });

  const createBrokenJsonRequest = (): Request =>
    ({
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    }) as unknown as Request;

  describe('不正なリクエストボディ', () => {
    const validBody = { fileName: 'movie.mp4', fileSize: 1024, contentType: 'video/mp4' };

    it.each([
      ['壊れた JSON', () => createBrokenJsonRequest()],
      ['null', () => createRequest(null)],
      ['配列', () => createRequest([validBody])],
      ['文字列', () => createRequest('movie.mp4')],
      ['fileName が数値', () => createRequest({ ...validBody, fileName: 1 })],
      ['fileSize が文字列', () => createRequest({ ...validBody, fileSize: '1024' })],
      ['contentType が数値', () => createRequest({ ...validBody, contentType: 1 })],
      ['contentType が null', () => createRequest({ ...validBody, contentType: null })],
      ['emotionFilter が数値', () => createRequest({ ...validBody, emotionFilter: 1 })],
      ['durationSec が null', () => createRequest({ ...validBody, durationSec: null })],
    ])('異常系: %s の場合は 400 を返し、下流を呼ばない', async (_label, buildRequest) => {
      const response = await POST(buildRequest());
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toEqual({
        error: 'INVALID_REQUEST',
        message: 'リクエストが不正です',
      });
      expect(mockGetSession).not.toHaveBeenCalled();
      expect(mockedGetSignedUrl).not.toHaveBeenCalled();
      expect(s3Send).not.toHaveBeenCalled();
      expect(batchSend).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
  describe('利用回数の制限', () => {
    const getEnvironment = (): { name: string; value: string }[] =>
      (batchSend.mock.calls[0][0] as { input: { containerOverrides: { environment: never[] } } })
        .input.containerOverrides.environment;

    const getReportedTitles = (): string[] =>
      (createErrorEventWriter() as InMemoryErrorEventWriter).getRecords().map((r) => r.title);

    it('ログイン済みで AI 解析の指定を省略すると AI ありで受け、Batch に伝える', async () => {
      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(201);
      expect(getEnvironment()).toContainEqual({ name: 'AI_ANALYSIS', value: 'true' });
    });

    it('aiAnalysis: false を渡すと AI なしで受け、Batch に伝える', async () => {
      const response = await POST(createRequest({ ...validBody, aiAnalysis: false }));

      expect(response.status).toBe(201);
      expect(getEnvironment()).toContainEqual({ name: 'AI_ANALYSIS', value: 'false' });
    });

    it('AI ありの残りが 0 なら、省略時は AI なしで受ける', async () => {
      await POST(createRequest(validBody));
      batchSend.mockClear();

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(201);
      expect(getEnvironment()).toContainEqual({ name: 'AI_ANALYSIS', value: 'false' });
    });

    it('AI ありを明示して残りが 0 なら 429 と AI の上限のコードを返す', async () => {
      await POST(createRequest(validBody));

      const response = await POST(createRequest({ ...validBody, aiAnalysis: true }));

      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({
        error: 'AI_LIMIT_EXCEEDED',
        message: '今月の AI 解析ありの利用回数の上限に達しました',
      });
    });

    it('AI なしの上限に達したら 429 と AI なしの上限のコードを返す', async () => {
      for (let i = 0; i < USAGE_LIMITS.free.noAiPerMonth; i += 1) {
        await POST(createRequest({ ...validBody, aiAnalysis: false }));
      }

      const response = await POST(createRequest({ ...validBody, aiAnalysis: false }));

      expect(response.status).toBe(429);
      expect((await response.json()).error).toBe('NO_AI_LIMIT_EXCEEDED');
    });

    it('申告された長さが段の上限を超えていれば 400 と長さの上限のコードを返し、ジョブを作らない', async () => {
      const response = await POST(
        createRequest({ ...validBody, durationSec: USAGE_LIMITS.free.maxDurationSec + 1 })
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('DURATION_LIMIT_EXCEEDED');
      expect(batchSend).not.toHaveBeenCalled();
    });

    it('有料の段は長い動画を受ける', async () => {
      mockGetSession.mockResolvedValue(STANDARD_SESSION);

      const response = await POST(
        createRequest({ ...validBody, durationSec: USAGE_LIMITS.free.maxDurationSec + 1 })
      );

      expect(response.status).toBe(201);
    });

    it('数えた記録と長さの上限をジョブに残す', async () => {
      const create = jest.spyOn(createJobRepository(), 'create');

      await POST(createRequest({ ...validBody, aiAnalysis: false }));

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          usage: {
            subject: 'USER#user-1',
            month: expect.stringMatching(/^\d{6}$/),
            kind: 'noAi',
            noAiLimit: USAGE_LIMITS.free.noAiPerMonth,
          },
          maxDurationSec: USAGE_LIMITS.free.maxDurationSec,
          aiAnalysis: false,
        })
      );
    });

    it('不正な aiAnalysis は 400 を返す', async () => {
      const response = await POST(createRequest({ ...validBody, aiAnalysis: 'yes' }));

      expect(response.status).toBe(400);
    });

    describe('未ログイン', () => {
      beforeEach(() => {
        mockGetSession.mockResolvedValue(null);
      });

      it('Cookie が無ければ匿名 ID を発行し、host-only の HttpOnly Cookie で渡す', async () => {
        const response = await POST(createRequest(validBody));

        expect(response.status).toBe(201);
        const cookie = response.headers.get('set-cookie') ?? '';
        expect(cookie).toMatch(/^qc_anon_id=[0-9a-f-]{36};/);
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Max-Age=31536000');
        expect(cookie).toContain('Path=/');
        expect(cookie).not.toContain('Domain');
      });

      it('本番では Secure を付ける。ローカル開発 (http) では付けない', async () => {
        const env = process.env as Record<string, string | undefined>;
        const original = env.NODE_ENV;
        try {
          env.NODE_ENV = 'production';
          expect((await POST(createRequest(validBody))).headers.get('set-cookie')).toContain(
            'Secure'
          );
          env.NODE_ENV = 'development';
          expect((await POST(createRequest(validBody))).headers.get('set-cookie')).not.toContain(
            'Secure'
          );
        } finally {
          env.NODE_ENV = original;
        }
      });

      it('有効な Cookie があれば再発行せず、その ID ごとに数える', async () => {
        const headers = { cookie: `other=1; qc_anon_id=${ANON_ID}` };
        for (let i = 0; i < 3; i += 1) {
          const response = await POST(createRequest(validBody, headers));
          expect(response.status).toBe(201);
          expect(response.headers.get('set-cookie')).toBeNull();
        }

        const response = await POST(createRequest(validBody, headers));

        expect(response.status).toBe(429);
        expect((await response.json()).error).toBe('NO_AI_LIMIT_EXCEEDED');
        const usage = await createUsageService().getUsage(
          buildAnonymousSubject(ANON_ID),
          'anonymous'
        );
        expect(usage.used).toEqual({ ai: 0, noAi: 3 });
      });

      it('形式の違う Cookie は無効として新しく発行する', async () => {
        const response = await POST(createRequest(validBody, { cookie: 'qc_anon_id=abc' }));

        expect(response.headers.get('set-cookie')).toMatch(/^qc_anon_id=[0-9a-f-]{36};/);
      });

      it('AI 解析は使えないため、省略時は AI なしで受ける', async () => {
        await POST(createRequest(validBody));

        expect(getEnvironment()).toContainEqual({ name: 'AI_ANALYSIS', value: 'false' });
      });

      it('429 のレスポンスでも新しい匿名 ID を渡す', async () => {
        const response = await POST(createRequest({ ...validBody, aiAnalysis: true }));

        expect(response.status).toBe(429);
        expect(response.headers.get('set-cookie')).toContain('qc_anon_id=');
      });

      it('同じ IP の 1 日の上限を超えると 429 と IP の上限のコードを返す', async () => {
        const headers = { 'x-nagiyu-viewer-ip': '203.0.113.7' };
        for (let i = 0; i < 20; i += 1) {
          // Cookie なしで申し込むたびに別の匿名 ID になる
          const response = await POST(createRequest(validBody, headers));
          expect(response.status).toBe(201);
        }

        const response = await POST(createRequest(validBody, headers));

        expect(response.status).toBe(429);
        expect((await response.json()).error).toBe('IP_LIMIT_EXCEEDED');
      });
    });

    describe('数えられないとき', () => {
      const breakUsageRepository = (): void => {
        const repository = createUsageRepository();
        jest.spyOn(repository, 'tryConsume').mockRejectedValue(new Error('dynamodb down'));
      };

      it('エラーを報告して通す (フェイルオープン)', async () => {
        breakUsageRepository();

        const response = await POST(createRequest(validBody));

        expect(response.status).toBe(201);
        expect(getReportedTitles()).toEqual(['Web API: 利用回数の確認エラー (バイパス)']);
      });

      it('通した場合は、AI ありの申し込みも AI なしとして処理する', async () => {
        breakUsageRepository();

        await POST(createRequest({ ...validBody, aiAnalysis: true }));

        expect(getEnvironment()).toContainEqual({ name: 'AI_ANALYSIS', value: 'false' });
      });

      it('通した場合、ジョブに回数の記録は残らない', async () => {
        breakUsageRepository();
        const create = jest.spyOn(createJobRepository(), 'create');

        await POST(createRequest(validBody));

        expect(create.mock.calls[0][0]).not.toHaveProperty('usage');
        expect(create.mock.calls[0][0]).toMatchObject({ aiAnalysis: false });
      });
    });

    describe('こちら側の理由でジョブを作れなかったとき', () => {
      it('数えた 1 回を戻す', async () => {
        batchSend.mockRejectedValueOnce(new Error('submit failed'));

        const response = await POST(createRequest({ ...validBody, aiAnalysis: true }));

        expect(response.status).toBe(500);
        const second = await POST(createRequest({ ...validBody, aiAnalysis: true }));
        expect(second.status).toBe(201);
      });

      it('レスポンスとして 500 を返す場合 (マルチパート ID が無い) も戻す', async () => {
        s3Send.mockResolvedValueOnce({});
        const big = { ...validBody, fileSize: 100 * 1024 * 1024, aiAnalysis: true };

        expect((await POST(createRequest(big))).status).toBe(500);

        expect((await POST(createRequest({ ...validBody, aiAnalysis: true }))).status).toBe(201);
      });

      it('ジョブを作れなかったときは、ジョブの印を介さずに戻す', async () => {
        jest.spyOn(createJobRepository(), 'create').mockRejectedValueOnce(new Error('db down'));

        const response = await POST(createRequest({ ...validBody, aiAnalysis: true }));

        expect(response.status).toBe(500);
        expect((await POST(createRequest({ ...validBody, aiAnalysis: true }))).status).toBe(201);
      });

      it('ジョブができた後の戻しは印を付け、Batch 側の戻しと重なっても二重に戻らない', async () => {
        batchSend.mockRejectedValueOnce(new Error('submit failed'));
        const create = jest.spyOn(createJobRepository(), 'create');

        await POST(createRequest({ ...validBody, aiAnalysis: true }));

        const job = await create.mock.results[0].value;
        const stored = await createJobRepository().getById(job.jobId);
        expect(stored?.usageReleased).toBe(true);
        const usageService = createUsageService();
        expect(await usageService.releaseForJob(job, createJobRepository())).toBe(false);
        const usage = await usageService.getUsage('USER#user-1', 'free');
        expect(usage.used).toEqual({ ai: 0, noAi: 0 });
      });

      it('例外で 500 を返すときも、新しく発行した匿名 ID の Cookie を付ける', async () => {
        mockGetSession.mockResolvedValue(null);
        batchSend.mockRejectedValueOnce(new Error('submit failed'));

        const response = await POST(createRequest(validBody));

        expect(response.status).toBe(500);
        expect(response.headers.get('set-cookie')).toMatch(/^qc_anon_id=[0-9a-f-]{36};/);
      });

      it('戻せなくても元のエラーを返し、戻せなかったことを報告する', async () => {
        const repository = createUsageRepository();
        jest.spyOn(repository, 'release').mockRejectedValue(new Error('release failed'));
        batchSend.mockRejectedValueOnce(new Error('submit failed'));

        const response = await POST(createRequest(validBody));

        expect(response.status).toBe(500);
        expect(getReportedTitles()).toContain('Web API: 利用回数を戻せませんでした');
      });
    });
  });
});
