import { NextRequest } from 'next/server';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { getAwsClients, createPresignedDownloadUrl, reportErrorEvent } from '@nagiyu/aws';
import { resetInMemoryRepositories } from '@nagiyu/codec-converter-core';
import { GET } from '@/app/api/jobs/[jobId]/route';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  getAwsClients: jest.fn(),
  createPresignedDownloadUrl: jest.fn(),
  reportErrorEvent: jest.fn(),
}));

const mockedGetAwsClients = getAwsClients as jest.MockedFunction<typeof getAwsClients>;
const mockedCreatePresignedDownloadUrl = createPresignedDownloadUrl as jest.MockedFunction<
  typeof createPresignedDownloadUrl
>;

const mockedReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;

const NOW = 1704067200000;

/** 保存形式 (新形式) のジョブアイテム */
const buildItem = (overrides: Record<string, unknown> = {}) => ({
  jobId: 'job-1',
  Type: 'Job',
  Status: 'PROCESSING',
  InputFile: 'uploads/job-1/input.mp4',
  OutputCodec: 'h264',
  FileName: 'movie.mp4',
  FileSize: 1024,
  CreatedAt: NOW,
  UpdatedAt: NOW,
  TTL: NOW / 1000 + 86400,
  ...overrides,
});

/** buildItem に対応する API 応答の Entity (時刻はミリ秒) */
const buildJob = (overrides: Record<string, unknown> = {}) => ({
  jobId: 'job-1',
  status: 'PROCESSING',
  inputFile: 'uploads/job-1/input.mp4',
  outputCodec: 'h264',
  fileName: 'movie.mp4',
  fileSize: 1024,
  createdAt: NOW,
  updatedAt: NOW,
  expiresAt: NOW + 86400 * 1000,
  ...overrides,
});

const callGet = () =>
  GET(new NextRequest('http://localhost/api/jobs/job-1'), {
    params: Promise.resolve({ jobId: 'job-1' }),
  });

describe('GET /api/jobs/[jobId]', () => {
  const dynamoSend = jest.fn();
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(process, 'env', { ...process.env, DYNAMODB_TABLE_NAME: 'test-table' });
    resetInMemoryRepositories();
    mockedReportErrorEvent.mockResolvedValue(undefined as never);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetAwsClients.mockReturnValue({
      docClient: { send: dynamoSend },
      s3Client: {},
    } as unknown as ReturnType<typeof getAwsClients>);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('ジョブが存在しない場合は 404 を返す', async () => {
    dynamoSend.mockResolvedValue({});

    const response = await callGet();

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('JOB_NOT_FOUND');
  });

  it('処理中のジョブはダウンロード URL なしで返す', async () => {
    const job = buildJob();
    dynamoSend.mockResolvedValue({ Item: buildItem() });

    const response = await callGet();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(job);
    const command = dynamoSend.mock.calls[0][0] as GetCommand;
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input.Key).toEqual({ jobId: 'job-1' });
    expect(mockedCreatePresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('完了したジョブはダウンロード URL を付けて返す', async () => {
    const job = buildJob({ status: 'COMPLETED', outputFile: 'outputs/job-1.mp4' });
    dynamoSend.mockResolvedValue({
      Item: buildItem({ Status: 'COMPLETED', OutputFile: 'outputs/job-1.mp4' }),
    });
    mockedCreatePresignedDownloadUrl.mockResolvedValue('https://example.com/download');

    const response = await callGet();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...job, downloadUrl: 'https://example.com/download' });
    expect(mockedCreatePresignedDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'outputs/job-1.mp4', expiresIn: 86400 }),
      expect.anything()
    );
  });

  it('完了していても出力ファイルがなければダウンロード URL は付けない', async () => {
    const job = buildJob({ status: 'COMPLETED' });
    dynamoSend.mockResolvedValue({ Item: buildItem({ Status: 'COMPLETED' }) });

    const response = await callGet();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(job);
    expect(mockedCreatePresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('旧形式 (camelCase・エポック秒) のジョブも、ミリ秒の Entity として返す', async () => {
    dynamoSend.mockResolvedValue({
      Item: {
        jobId: 'job-1',
        status: 'PROCESSING',
        inputFile: 'uploads/job-1/input.mp4',
        outputCodec: 'h264',
        fileName: 'movie.mp4',
        fileSize: 1024,
        createdAt: NOW / 1000,
        updatedAt: NOW / 1000,
        expiresAt: NOW / 1000 + 86400,
      },
    });

    const response = await callGet();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(buildJob());
  });

  it('保存されたジョブが読めない形式の場合は 500 を返す', async () => {
    dynamoSend.mockResolvedValue({ Item: buildItem({ Status: 'UNKNOWN' }) });

    const response = await callGet();

    expect(response.status).toBe(500);
  });

  it('DynamoDB でエラーが起きた場合は 500 を返しエラーイベントを送る', async () => {
    dynamoSend.mockRejectedValue(new Error('DynamoDB error'));

    const response = await callGet();

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('INTERNAL_SERVER_ERROR');
    expect(mockedReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'codec-converter',
        title: 'Web API: ジョブ取得エラー',
        message: expect.stringContaining('DynamoDB error'),
      })
    );
  });
});
