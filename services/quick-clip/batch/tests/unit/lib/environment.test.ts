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
      openAiApiKey: undefined,
      emotionFilter: 'any',
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

  it('extract 以外の BATCH_COMMAND でエラーになる', () => {
    process.env.BATCH_COMMAND = 'split';
    process.env.JOB_ID = 'job-1';
    process.env.DYNAMODB_TABLE_NAME = 'table';
    process.env.S3_BUCKET = 'bucket';
    process.env.AWS_REGION = 'ap-northeast-1';

    expect(() => validateEnvironment()).toThrow(
      '必要な環境変数が設定されていません: BATCH_COMMAND'
    );
  });

  it('OPENAI_API_KEY が設定されている場合に openAiApiKey として読み取れる', () => {
    process.env.BATCH_COMMAND = 'extract';
    process.env.JOB_ID = 'job-1';
    process.env.DYNAMODB_TABLE_NAME = 'table';
    process.env.S3_BUCKET = 'bucket';
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.OPENAI_API_KEY = 'sk-test-key';

    const result = validateEnvironment();

    expect(result.openAiApiKey).toBe('sk-test-key');
  });

  it('OPENAI_API_KEY が未設定の場合に openAiApiKey が undefined になる', () => {
    process.env.BATCH_COMMAND = 'extract';
    process.env.JOB_ID = 'job-1';
    process.env.DYNAMODB_TABLE_NAME = 'table';
    process.env.S3_BUCKET = 'bucket';
    process.env.AWS_REGION = 'ap-northeast-1';
    delete process.env.OPENAI_API_KEY;

    const result = validateEnvironment();

    expect(result.openAiApiKey).toBeUndefined();
  });

  it('OPENAI_API_KEY が空文字列の場合に openAiApiKey が undefined になる', () => {
    process.env.BATCH_COMMAND = 'extract';
    process.env.JOB_ID = 'job-1';
    process.env.DYNAMODB_TABLE_NAME = 'table';
    process.env.S3_BUCKET = 'bucket';
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.OPENAI_API_KEY = '';

    const result = validateEnvironment();

    expect(result.openAiApiKey).toBeUndefined();
  });

  it('EMOTION_FILTER が未設定の場合にデフォルト値 any になる', () => {
    process.env.BATCH_COMMAND = 'extract';
    process.env.JOB_ID = 'job-1';
    process.env.DYNAMODB_TABLE_NAME = 'table';
    process.env.S3_BUCKET = 'bucket';
    process.env.AWS_REGION = 'ap-northeast-1';
    delete process.env.EMOTION_FILTER;

    const result = validateEnvironment();

    expect(result.emotionFilter).toBe('any');
  });

  it.each(['any', 'laugh', 'excite', 'touch', 'tension'] as const)(
    'EMOTION_FILTER = %s を正常に読み取れる',
    (filter) => {
      process.env.BATCH_COMMAND = 'extract';
      process.env.JOB_ID = 'job-1';
      process.env.DYNAMODB_TABLE_NAME = 'table';
      process.env.S3_BUCKET = 'bucket';
      process.env.AWS_REGION = 'ap-northeast-1';
      process.env.EMOTION_FILTER = filter;

      const result = validateEnvironment();

      expect(result.emotionFilter).toBe(filter);
    }
  );

  it('不正な EMOTION_FILTER でエラーになる', () => {
    process.env.BATCH_COMMAND = 'extract';
    process.env.JOB_ID = 'job-1';
    process.env.DYNAMODB_TABLE_NAME = 'table';
    process.env.S3_BUCKET = 'bucket';
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.EMOTION_FILTER = 'invalid';

    expect(() => validateEnvironment()).toThrow('EMOTION_FILTER の値が不正です');
  });
});
