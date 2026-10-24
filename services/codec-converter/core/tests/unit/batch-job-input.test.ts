import {
  BATCH_JOB_INPUT_ENV_NAMES,
  readBatchJobInput,
  toBatchEnvironment,
} from '../../src/batch-job-input.js';
import type { CodecType } from '../../src/types.js';

describe('toBatchEnvironment', () => {
  it('起動ごとの入力を name と value の配列へ変換する', () => {
    expect(toBatchEnvironment({ jobId: 'job-1', outputCodec: 'vp9' })).toEqual([
      { name: 'JOB_ID', value: 'job-1' },
      { name: 'OUTPUT_CODEC', value: 'vp9' },
    ]);
  });

  it('起動ごとに変わらない値は含めない', () => {
    const names = toBatchEnvironment({ jobId: 'job-1', outputCodec: 'h264' }).map((v) => v.name);
    expect(names).toEqual(Object.values(BATCH_JOB_INPUT_ENV_NAMES));
  });
});

describe('readBatchJobInput', () => {
  it.each<CodecType>(['h264', 'vp9', 'av1'])('%s を入力として読み取れる', (codec) => {
    expect(readBatchJobInput({ JOB_ID: 'job-1', OUTPUT_CODEC: codec })).toEqual({
      jobId: 'job-1',
      outputCodec: codec,
    });
  });

  it('web が渡す形式をそのまま読み取れる', () => {
    const env = Object.fromEntries(
      toBatchEnvironment({ jobId: 'job-2', outputCodec: 'av1' }).map(({ name, value }) => [
        name,
        value,
      ])
    );
    expect(readBatchJobInput(env)).toEqual({ jobId: 'job-2', outputCodec: 'av1' });
  });

  it('前後の空白を取り除く', () => {
    expect(readBatchJobInput({ JOB_ID: ' job-1 ', OUTPUT_CODEC: ' h264 ' })).toEqual({
      jobId: 'job-1',
      outputCodec: 'h264',
    });
  });

  it('JOB_ID が未設定の場合はエラー', () => {
    expect(() => readBatchJobInput({ OUTPUT_CODEC: 'h264' })).toThrow(
      '必要な環境変数が設定されていません: JOB_ID'
    );
  });

  it('OUTPUT_CODEC が空白のみの場合はエラー', () => {
    expect(() => readBatchJobInput({ JOB_ID: 'job-1', OUTPUT_CODEC: '  ' })).toThrow(
      '必要な環境変数が設定されていません: OUTPUT_CODEC'
    );
  });

  it('両方未設定の場合は両方の名前をエラーに含める', () => {
    expect(() => readBatchJobInput({})).toThrow('JOB_ID, OUTPUT_CODEC');
  });

  it('OUTPUT_CODEC が不正な場合はエラー', () => {
    expect(() => readBatchJobInput({ JOB_ID: 'job-1', OUTPUT_CODEC: 'invalid' })).toThrow(
      '出力コーデックが不正です'
    );
  });
});
