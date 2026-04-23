import { getS3Client } from '@/lib/server/aws';
import { POST } from '@/app/api/jobs/[jobId]/abort-upload/route';

jest.mock('@/lib/server/aws', () => ({
  getBucketName: jest.fn(() => 'test-bucket'),
  getS3Client: jest.fn(),
}));

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
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetS3Client.mockReturnValue({
      send: s3Send.mockResolvedValue({}),
    } as ReturnType<typeof getS3Client>);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

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
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[POST /api/jobs/[jobId]/abort-upload] アップロード中断処理に失敗しました',
      abortError
    );
  });
});
