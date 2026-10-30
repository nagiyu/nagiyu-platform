import { NextRequest } from 'next/server';
import { SubmitJobCommand } from '@aws-sdk/client-batch';
import { getAwsClients, reportErrorEvent } from '@nagiyu/aws';
import { errorReporter } from '@/lib/api-error-reporting';
import { selectJobDefinition } from '@nagiyu/codec-converter-core';
import { POST } from '@/app/api/jobs/[jobId]/submit/route';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  getAwsClients: jest.fn(),
  reportErrorEvent: jest.fn(),
}));

jest.mock('@/lib/api-error-reporting', () => ({
  ...jest.requireActual('@/lib/api-error-reporting'),
  errorReporter: {
    report: jest.fn().mockResolvedValue(null),
    onError: jest.fn(() => jest.fn()),
  },
}));

jest.mock('@nagiyu/codec-converter-core', () => ({
  ...jest.requireActual('@nagiyu/codec-converter-core'),
  selectJobDefinition: jest.fn(),
}));

const mockedGetAwsClients = getAwsClients as jest.MockedFunction<typeof getAwsClients>;
const mockedReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;
const mockedSelectJobDefinition = selectJobDefinition as jest.MockedFunction<
  typeof selectJobDefinition
>;

const NOW = 1704067200000;

/** 保存形式 (新形式) のジョブアイテム */
const pendingJob = {
  jobId: 'job-1',
  Type: 'Job',
  Status: 'PENDING',
  InputFile: 'inputs/job-1.mp4',
  OutputCodec: 'h264',
  FileName: 'movie.mp4',
  FileSize: 1024,
  CreatedAt: NOW,
  UpdatedAt: NOW,
  TTL: NOW / 1000 + 86400,
};

const callPost = () =>
  POST(new NextRequest('http://localhost/api/jobs/job-1/submit', { method: 'POST' }), {
    params: Promise.resolve({ jobId: 'job-1' }),
  });

describe('POST /api/jobs/[jobId]/submit', () => {
  const dynamoSend = jest.fn();
  const s3Send = jest.fn();
  const batchSend = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    (['error', 'warn', 'log'] as const).forEach((method) =>
      jest.spyOn(console, method).mockImplementation(() => {})
    );
    jest.replaceProperty(process, 'env', {
      ...process.env,
      BATCH_JOB_DEFINITION_PREFIX: 'codec',
    });
    mockedGetAwsClients.mockReturnValue({
      docClient: { send: dynamoSend },
      s3Client: { send: s3Send },
      batchClient: { send: batchSend },
    } as unknown as ReturnType<typeof getAwsClients>);
    dynamoSend.mockResolvedValue({ Item: pendingJob });
    s3Send.mockResolvedValue({});
    batchSend.mockResolvedValue({});
    mockedSelectJobDefinition.mockReturnValue('small');
    mockedReportErrorEvent.mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ジョブが存在しない場合は 404 を返す', async () => {
    dynamoSend.mockResolvedValue({});

    const response = await callPost();

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('JOB_NOT_FOUND');
    expect(batchSend).not.toHaveBeenCalled();
  });

  it('PENDING 以外のジョブは 409 を返す', async () => {
    dynamoSend.mockResolvedValue({ Item: { ...pendingJob, Status: 'PROCESSING' } });

    const response = await callPost();

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('INVALID_STATUS');
    expect(batchSend).not.toHaveBeenCalled();
  });

  it('入力ファイルが S3 にない場合は 404 を返しエラーイベントを送る', async () => {
    const s3Error = new Error('NotFound');
    s3Send.mockRejectedValue(s3Error);

    const response = await callPost();

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('FILE_NOT_FOUND');
    expect(errorReporter.report).toHaveBeenCalledWith('入力ファイルがS3に存在しません', s3Error, {
      context: { jobId: 'job-1', s3Key: 'inputs/job-1.mp4' },
    });
    expect(batchSend).not.toHaveBeenCalled();
  });

  it('選択したジョブ定義で Batch ジョブを投入する', async () => {
    const response = await callPost();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jobId: 'job-1', status: 'PENDING' });
    expect(batchSend).toHaveBeenCalledTimes(1);
    const command = batchSend.mock.calls[0][0] as SubmitJobCommand;
    expect(command).toBeInstanceOf(SubmitJobCommand);
    expect(command.input.jobDefinition).toBe('codec-small');
    expect(command.input.jobName).toBe('codec-converter-job-1');
    // テーブル名などはジョブ定義が持つため、起動ごとの値だけを渡す
    expect(command.input.containerOverrides?.environment).toEqual([
      { name: 'JOB_ID', value: 'job-1' },
      { name: 'OUTPUT_CODEC', value: 'h264' },
    ]);
  });

  it('ジョブ定義の選択に失敗した場合は medium で投入する', async () => {
    const selectError = new Error('選択できません');
    mockedSelectJobDefinition.mockImplementation(() => {
      throw selectError;
    });

    const response = await callPost();

    expect(response.status).toBe(200);
    expect((batchSend.mock.calls[0][0] as SubmitJobCommand).input.jobDefinition).toBe(
      'codec-medium'
    );
    // 処理を続行するため上に例外が届かない。その場で報告されること
    expect(errorReporter.report).toHaveBeenCalledTimes(1);
    expect(errorReporter.report).toHaveBeenCalledWith(
      'ジョブ定義の選択に失敗したため medium で続行します',
      selectError,
      { context: { jobId: 'job-1', fileSize: 1024, outputCodec: 'h264' } }
    );
  });

  it('ジョブ定義が原因で投入に失敗した場合は medium で再投入する', async () => {
    const submitError = new Error('JobDefinition not found');
    batchSend.mockRejectedValueOnce(submitError);

    const response = await callPost();

    expect(response.status).toBe(200);
    expect(batchSend).toHaveBeenCalledTimes(2);
    const fallbackCommand = batchSend.mock.calls[1][0] as SubmitJobCommand;
    expect(fallbackCommand.input.jobDefinition).toBe('codec-medium');
    expect(fallbackCommand.input.containerOverrides?.environment).toEqual(
      (batchSend.mock.calls[0][0] as SubmitJobCommand).input.containerOverrides?.environment
    );
    expect(errorReporter.report).toHaveBeenCalledTimes(1);
    expect(errorReporter.report).toHaveBeenCalledWith(
      'ジョブ定義でのBatchジョブ投入に失敗したため medium で再投入します',
      submitError,
      { context: { jobId: 'job-1', jobDefinitionName: 'codec-small' } }
    );
  });

  it('ジョブ定義以外が原因で投入に失敗した場合は 500 を返しエラーイベントを送る', async () => {
    batchSend.mockRejectedValue(new Error('Throttling'));

    const response = await callPost();

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('INTERNAL_SERVER_ERROR');
    expect(batchSend).toHaveBeenCalledTimes(1);
    expect(mockedReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'codec-converter',
        title: 'Batchジョブの投入に失敗しました',
        message: 'Throttling',
        context: expect.objectContaining({ pathname: '/api/jobs/job-1/submit' }),
      })
    );
  });
});
