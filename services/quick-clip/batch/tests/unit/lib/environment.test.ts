import { validateEnvironment } from '../../../src/lib/environment.js';

describe('validateEnvironment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('必須環境変数を読み取れる', () => {
    process.env.BATCH_COMMAND = 'extract';
    process.env.JOB_ID = 'job-1';
    process.env.DYNAMODB_TABLE_NAME = 'table';
    process.env.S3_BUCKET = 'bucket';
    process.env.AWS_REGION = 'ap-northeast-1';

    expect(validateEnvironment()).toEqual({
      command: 'extract',
      jobId: 'job-1',
      tableName: 'table',
      bucketName: 'bucket',
      awsRegion: 'ap-northeast-1',
    });
  });

  it('必須環境変数不足でエラーになる', () => {
    delete process.env.BATCH_COMMAND;
    delete process.env.JOB_ID;
    delete process.env.DYNAMODB_TABLE_NAME;
    delete process.env.S3_BUCKET;
    delete process.env.AWS_REGION;

    expect(() => validateEnvironment()).toThrow(
      '必要な環境変数が設定されていません: BATCH_COMMAND, JOB_ID, DYNAMODB_TABLE_NAME, S3_BUCKET, AWS_REGION'
    );
  });

  it('不正な jobId でエラーになる', () => {
    process.env.BATCH_COMMAND = 'extract';
    process.env.JOB_ID = 'job id';
    process.env.DYNAMODB_TABLE_NAME = 'table';
    process.env.S3_BUCKET = 'bucket';
    process.env.AWS_REGION = 'ap-northeast-1';

    expect(() => validateEnvironment()).toThrow('ジョブIDが不正です');
  });
});
