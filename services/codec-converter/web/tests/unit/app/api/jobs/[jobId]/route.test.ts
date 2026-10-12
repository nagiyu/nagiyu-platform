import { NextRequest } from 'next/server';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { getAwsClients, createPresignedDownloadUrl, reportErrorEvent } from '@nagiyu/aws';
import { GET } from '@/app/api/jobs/[jobId]/route';

jest.mock('@nagiyu/aws', () => ({
  getAwsClients: jest.fn(),
  createPresignedDownloadUrl: jest.fn(),
  reportErrorEvent: jest.fn(),
}));

const mockedGetAwsClients = getAwsClients as jest.MockedFunction<typeof getAwsClients>;
const mockedCreatePresignedDownloadUrl = createPresignedDownloadUrl as jest.MockedFunction<
  typeof createPresignedDownloadUrl
>;

const mockedReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;

const callGet = () =>
  GET(new NextRequest('http://localhost/api/jobs/job-1'), {
    params: Promise.resolve({ jobId: 'job-1' }),
  });

describe('GET /api/jobs/[jobId]', () => {
  const dynamoSend = jest.fn();
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedReportErrorEvent.mockResolvedValue(undefined as never);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetAwsClients.mockReturnValue({
      docClient: { send: dynamoSend },
      s3Client: {},
    } as unknown as ReturnType<typeof getAwsClients>);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('ジョブが存在しない場合は 404 を返す', async () => {
    dynamoSend.mockResolvedValue({});

    const response = await callGet();

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('JOB_NOT_FOUND');
  });

  it('処理中のジョブはダウンロード URL なしで返す', async () => {
    const job = { jobId: 'job-1', status: 'PROCESSING' };
    dynamoSend.mockResolvedValue({ Item: job });

    const response = await callGet();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(job);
    expect(dynamoSend.mock.calls[0][0]).toBeInstanceOf(GetCommand);
    expect(mockedCreatePresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('完了したジョブはダウンロード URL を付けて返す', async () => {
    const job = { jobId: 'job-1', status: 'COMPLETED', outputFile: 'outputs/job-1.mp4' };
    dynamoSend.mockResolvedValue({ Item: job });
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
    const job = { jobId: 'job-1', status: 'COMPLETED' };
    dynamoSend.mockResolvedValue({ Item: job });

    const response = await callGet();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(job);
    expect(mockedCreatePresignedDownloadUrl).not.toHaveBeenCalled();
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
        message: 'DynamoDB error',
      })
    );
  });
});
