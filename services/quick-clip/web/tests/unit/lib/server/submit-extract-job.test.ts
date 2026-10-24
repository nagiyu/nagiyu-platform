import { getBatchClient } from '@/lib/server/aws';
import { submitExtractJob } from '@/lib/server/submit-extract-job';

jest.mock('@/lib/server/aws', () => ({
  getBatchClient: jest.fn(),
  getBatchJobDefinitionPrefix: jest.fn(() => 'nagiyu-quick-clip-dev'),
  getBatchJobQueueArn: jest.fn(() => 'arn:aws:batch:us-east-1:123456789012:job-queue/quick-clip'),
}));

describe('submitExtractJob', () => {
  const send = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    send.mockResolvedValue({ jobId: 'batch-job-1' });
    (getBatchClient as jest.Mock).mockReturnValue({ send });
  });

  it('起動ごとの値だけを environment に渡し、Batch ジョブ ID を返す', async () => {
    const batchJobId = await submitExtractJob({
      jobId: 'job-1',
      fileSize: 1024,
      emotionFilter: 'laugh',
    });

    expect(batchJobId).toBe('batch-job-1');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toEqual({
      jobName: 'quick-clip-extract-job-1',
      jobQueue: 'arn:aws:batch:us-east-1:123456789012:job-queue/quick-clip',
      jobDefinition: 'nagiyu-quick-clip-dev-small',
      containerOverrides: {
        environment: [
          { name: 'BATCH_COMMAND', value: 'extract' },
          { name: 'JOB_ID', value: 'job-1' },
          { name: 'EMOTION_FILTER', value: 'laugh' },
        ],
      },
    });
  });

  it('emotionFilter 未指定時は any を渡す', async () => {
    await submitExtractJob({ jobId: 'job-1', fileSize: 1024 });

    expect(send.mock.calls[0][0].input.containerOverrides.environment).toContainEqual({
      name: 'EMOTION_FILTER',
      value: 'any',
    });
  });

  it('ファイルサイズと再生時間に応じたジョブ定義を選ぶ', async () => {
    await submitExtractJob({
      jobId: 'job-1',
      fileSize: 100 * 1024 * 1024 * 1024,
      durationSec: 3 * 60 * 60,
    });

    expect(send.mock.calls[0][0].input.jobDefinition).toBe('nagiyu-quick-clip-dev-xlarge');
  });

  it('ジョブ名は 128 文字に切り詰める', async () => {
    await submitExtractJob({ jobId: 'a'.repeat(200), fileSize: 1024 });

    expect(send.mock.calls[0][0].input.jobName).toHaveLength(128);
  });

  it('Batch の投入に失敗した場合はエラーを伝搬する', async () => {
    const error = new Error('submit failed');
    send.mockRejectedValueOnce(error);

    await expect(submitExtractJob({ jobId: 'job-1', fileSize: 1024 })).rejects.toBe(error);
  });
});
