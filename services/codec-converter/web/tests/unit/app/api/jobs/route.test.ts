import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { getAwsClients, reportErrorEvent, createPresignedUploadUrl } from '@nagiyu/aws';
import { resetInMemoryRepositories } from '@nagiyu/codec-converter-core';
import { POST } from '@/app/api/jobs/route';

jest.mock('uuid', () => ({
  v4: () => 'job-uuid-1',
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  getAwsClients: jest.fn(),
  reportErrorEvent: jest.fn(),
  createPresignedUploadUrl: jest.fn(),
}));

const mockedGetAwsClients = getAwsClients as jest.MockedFunction<typeof getAwsClients>;
const mockedReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;
const mockedCreatePresignedUploadUrl = createPresignedUploadUrl as jest.MockedFunction<
  typeof createPresignedUploadUrl
>;

const NOW = 1704067200000;

const validBody = {
  fileName: 'movie.mp4',
  fileSize: 1024,
  contentType: 'video/mp4',
  outputCodec: 'h264',
};

const createRequest = (body: unknown) =>
  new Request('http://localhost/api/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];

const createRawRequest = (rawBody: string) =>
  new Request('http://localhost/api/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody,
  }) as unknown as Parameters<typeof POST>[0];

describe('POST /api/jobs', () => {
  const dynamoSend = jest.fn();
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(process, 'env', { ...process.env, DYNAMODB_TABLE_NAME: 'test-table' });
    resetInMemoryRepositories();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(NOW);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetAwsClients.mockReturnValue({
      docClient: { send: dynamoSend },
      s3Client: {},
    } as unknown as ReturnType<typeof getAwsClients>);
    dynamoSend.mockResolvedValue({});
    mockedCreatePresignedUploadUrl.mockResolvedValue('https://example.com/upload');
    mockedReportErrorEvent.mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('ジョブを作成し、Presigned URL を 201 で返す', async () => {
    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      jobId: 'job-uuid-1',
      uploadUrl: 'https://example.com/upload',
      expiresIn: 3600,
    });
    expect(dynamoSend).toHaveBeenCalledTimes(1);
    const putCommand = dynamoSend.mock.calls[0][0] as PutCommand;
    expect(putCommand).toBeInstanceOf(PutCommand);
    // 保存形式: PascalCase の属性、時刻はミリ秒、TTL はエポック秒
    expect(putCommand.input.Item).toMatchObject({
      jobId: 'job-uuid-1',
      Type: 'Job',
      Status: 'PENDING',
      InputFile: 'uploads/job-uuid-1/input.mp4',
      OutputCodec: 'h264',
      FileName: 'movie.mp4',
      FileSize: 1024,
      CreatedAt: NOW,
      UpdatedAt: NOW,
      TTL: Math.floor(NOW / 1000) + 86400,
    });
    expect(mockedCreatePresignedUploadUrl).toHaveBeenCalledTimes(1);
    expect(mockedReportErrorEvent).not.toHaveBeenCalled();
  });

  it('必須フィールドが不足している場合は 400 を返す', async () => {
    const response = await POST(createRequest({ fileName: 'movie.mp4' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'INVALID_REQUEST',
      message: '必須フィールドが不足しています',
    });
    expect(dynamoSend).not.toHaveBeenCalled();
  });

  it('MP4 以外のファイルは 400 を返す', async () => {
    const response = await POST(createRequest({ ...validBody, fileName: 'movie.avi' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ error: 'INVALID_FILE_TYPE' }));
    expect(dynamoSend).not.toHaveBeenCalled();
  });

  it('サイズ上限を超えるファイルは 400 を返す', async () => {
    const response = await POST(createRequest({ ...validBody, fileSize: 1024 * 1024 * 1024 * 10 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ error: 'INVALID_FILE_SIZE' }));
    expect(dynamoSend).not.toHaveBeenCalled();
  });

  it('無効なコーデックは 400 を返す', async () => {
    const response = await POST(createRequest({ ...validBody, outputCodec: 'unknown' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'INVALID_CODEC',
      message: '無効なコーデックが指定されました',
    });
    expect(dynamoSend).not.toHaveBeenCalled();
  });

  it('下流で例外が発生した場合は 500 を返し、通報する', async () => {
    dynamoSend.mockRejectedValue(new Error('DynamoDB error'));

    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(500);
    expect(mockedReportErrorEvent).toHaveBeenCalledTimes(1);
  });

  describe('不正なリクエストボディ', () => {
    it.each([
      ['壊れた JSON', () => createRawRequest('{"fileName": ')],
      ['空のボディ', () => createRawRequest('')],
      ['null', () => createRawRequest('null')],
      ['配列', () => createRawRequest(JSON.stringify([validBody]))],
      ['文字列', () => createRawRequest('"movie.mp4"')],
    ])('ボディが %s の場合は 400 を返し、下流も通報も呼ばない', async (_label, buildRequest) => {
      const response = await POST(buildRequest());

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'INVALID_REQUEST',
        message: 'リクエストボディが不正です',
      });
      expect(dynamoSend).not.toHaveBeenCalled();
      expect(mockedCreatePresignedUploadUrl).not.toHaveBeenCalled();
      expect(mockedReportErrorEvent).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['fileName が数値', { ...validBody, fileName: 1 }],
      ['fileName が配列', { ...validBody, fileName: ['movie.mp4'] }],
      ['contentType が数値', { ...validBody, contentType: 1 }],
      ['contentType がオブジェクト', { ...validBody, contentType: { type: 'video/mp4' } }],
    ])('%s の場合は 400 を返し、下流も通報も呼ばない', async (_label, body) => {
      const response = await POST(createRequest(body));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'INVALID_REQUEST',
        message: 'リクエストボディが不正です',
      });
      expect(dynamoSend).not.toHaveBeenCalled();
      expect(mockedCreatePresignedUploadUrl).not.toHaveBeenCalled();
      expect(mockedReportErrorEvent).not.toHaveBeenCalled();
    });

    it('fileSize が文字列の場合は必須フィールド不足と同じ 400 を返す', async () => {
      const response = await POST(createRequest({ ...validBody, fileSize: '1024' }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'INVALID_REQUEST',
        message: '必須フィールドが不足しています',
      });
      expect(dynamoSend).not.toHaveBeenCalled();
      expect(mockedReportErrorEvent).not.toHaveBeenCalled();
    });

    it.each([
      ['数値', 1],
      ['配列', ['h264']],
      ['オブジェクト', { codec: 'h264' }],
    ])(
      'outputCodec が %s の場合は無効なコーデックとして 400 を返す',
      async (_label, outputCodec) => {
        const response = await POST(createRequest({ ...validBody, outputCodec }));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: 'INVALID_CODEC',
          message: '無効なコーデックが指定されました',
        });
        expect(dynamoSend).not.toHaveBeenCalled();
        expect(mockedReportErrorEvent).not.toHaveBeenCalled();
      }
    );
  });
});
