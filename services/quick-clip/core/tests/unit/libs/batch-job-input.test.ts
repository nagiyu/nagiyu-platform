import {
  BATCH_JOB_ENV_NAMES,
  DEFAULT_EMOTION_FILTER,
  EMOTION_FILTERS,
  readBatchJobInput,
  toBatchJobEnvironment,
} from '../../../src/libs/batch-job-input.js';

describe('toBatchJobEnvironment', () => {
  it('起動ごとの入力だけを name / value の配列に変換する', () => {
    const environment = toBatchJobEnvironment({
      command: 'extract',
      jobId: 'job-1',
      emotionFilter: 'laugh',
    });

    expect(environment).toEqual([
      { name: 'BATCH_COMMAND', value: 'extract' },
      { name: 'JOB_ID', value: 'job-1' },
      { name: 'EMOTION_FILTER', value: 'laugh' },
    ]);
  });

  it('ジョブ定義が持つ値を含まない', () => {
    const names = toBatchJobEnvironment({
      command: 'extract',
      jobId: 'job-1',
      emotionFilter: 'any',
    }).map((entry) => entry.name);

    expect(names).not.toContain('DYNAMODB_TABLE_NAME');
    expect(names).not.toContain('S3_BUCKET');
    expect(names).not.toContain('AWS_REGION');
  });

  it('変換結果を読み取り関数に渡すと元の入力に戻る', () => {
    const input = { command: 'extract', jobId: 'job_2-A', emotionFilter: 'tension' } as const;
    const record = Object.fromEntries(
      toBatchJobEnvironment(input).map((entry) => [entry.name, entry.value])
    );

    expect(readBatchJobInput(record)).toEqual(input);
  });
});

describe('readBatchJobInput', () => {
  const validEnv = {
    [BATCH_JOB_ENV_NAMES.COMMAND]: 'extract',
    [BATCH_JOB_ENV_NAMES.JOB_ID]: 'job-1',
  };

  it('必須の変数を読み取り、EMOTION_FILTER 未設定なら既定値になる', () => {
    expect(readBatchJobInput(validEnv)).toEqual({
      command: 'extract',
      jobId: 'job-1',
      emotionFilter: DEFAULT_EMOTION_FILTER,
    });
  });

  it('前後の空白を取り除いて読み取る', () => {
    expect(
      readBatchJobInput({
        BATCH_COMMAND: ' extract ',
        JOB_ID: ' job-1 ',
        EMOTION_FILTER: ' laugh ',
      })
    ).toEqual({ command: 'extract', jobId: 'job-1', emotionFilter: 'laugh' });
  });

  it('EMOTION_FILTER が空白のみなら既定値になる', () => {
    expect(readBatchJobInput({ ...validEnv, EMOTION_FILTER: '   ' }).emotionFilter).toBe('any');
  });

  it.each(EMOTION_FILTERS)('EMOTION_FILTER = %s を読み取れる', (filter) => {
    expect(readBatchJobInput({ ...validEnv, EMOTION_FILTER: filter }).emotionFilter).toBe(filter);
  });

  it('不正な EMOTION_FILTER でエラーになる', () => {
    expect(() => readBatchJobInput({ ...validEnv, EMOTION_FILTER: 'invalid' })).toThrow(
      'EMOTION_FILTER の値が不正です'
    );
  });

  it('BATCH_COMMAND と JOB_ID の両方が未設定なら不足分をまとめて報告する', () => {
    expect(() => readBatchJobInput({})).toThrow(
      '必要な環境変数が設定されていません: BATCH_COMMAND, JOB_ID'
    );
  });

  it('JOB_ID のみ未設定ならその変数名だけ報告する', () => {
    expect(() => readBatchJobInput({ BATCH_COMMAND: 'extract', JOB_ID: '  ' })).toThrow(
      '必要な環境変数が設定されていません: JOB_ID'
    );
  });

  it('extract 以外の BATCH_COMMAND でエラーになる', () => {
    expect(() => readBatchJobInput({ ...validEnv, BATCH_COMMAND: 'split' })).toThrow(
      '必要な環境変数が設定されていません: BATCH_COMMAND'
    );
  });

  it.each(['job id', 'job/1', '../job', 'job.1'])('不正な JOB_ID "%s" でエラーになる', (jobId) => {
    expect(() => readBatchJobInput({ ...validEnv, JOB_ID: jobId })).toThrow('ジョブIDが不正です');
  });
});
