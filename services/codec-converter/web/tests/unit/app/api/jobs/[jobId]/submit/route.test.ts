import { NextRequest } from 'next/server';
import { SubmitJobCommand } from '@aws-sdk/client-batch';
import { getAwsClients, reportErrorEvent } from '@nagiyu/aws';
import { selectJobDefinition } from '@nagiyu/codec-converter-core';
import { POST } from '@/app/api/jobs/[jobId]/submit/route';

jest.mock('@nagiyu/aws', () => ({
  getAwsClients: jest.fn(),
  reportErrorEvent: jest.fn(),
}));

jest.mock('@nagiyu/codec-converter-core', () => ({
  selectJobDefinition: jest.fn(),
}));

const mockedGetAwsClients = getAwsClients as jest.MockedFunction<typeof getAwsClients>;
const mockedReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;
const mockedSelectJobDefinition = selectJobDefinition as jest.MockedFunction<
  typeof selectJobDefinition
>;

const pendingJob = {
  jobId: 'job-1',
  status: 'PENDING',
  inputFile: 'inputs/job-1.mp4',
  fileSize: 1024,
  outputCodec: 'h264',
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
    dynamoSend.mockResolvedValue({ Item: { ...pendingJob, status: 'PROCESSING' } });

    const response = await callPost();

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('INVALID_STATUS');
    expect(batchSend).not.toHaveBeenCalled();
  });

  it('入力ファイルが S3 にない場合は 404 を返しエラーイベントを送る', async () => {
    s3Send.mockRejectedValue(new Error('NotFound'));

    const response = await callPost();

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('FILE_NOT_FOUND');
    expect(mockedReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'codec-converter', message: 'NotFound' })
    );
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
  });

  it('ジョブ定義の選択に失敗した場合は medium で投入する', async () => {
    mockedSelectJobDefinition.mockImplementation(() => {
      throw new Error('選択できません');
    });

    const response = await callPost();

    expect(response.status).toBe(200);
    expect((batchSend.mock.calls[0][0] as SubmitJobCommand).input.jobDefinition).toBe(
      'codec-medium'
    );
  });

  it('ジョブ定義が原因で投入に失敗した場合は medium で再投入する', async () => {
    batchSend.mockRejectedValueOnce(new Error('JobDefinition not found'));

    const response = await callPost();

    expect(response.status).toBe(200);
    expect(batchSend).toHaveBeenCalledTimes(2);
    expect((batchSend.mock.calls[1][0] as SubmitJobCommand).input.jobDefinition).toBe(
      'codec-medium'
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
        message: 'Throttling',
        context: expect.objectContaining({ jobId: 'job-1' }),
      })
    );
  });
});
