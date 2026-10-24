import type { CodecType } from './types.js';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  MISSING_ENV: '必要な環境変数が設定されていません',
  INVALID_OUTPUT_CODEC: '出力コーデックが不正です',
} as const;

/**
 * Batch ジョブへ渡す環境変数の名前
 *
 * web (渡す側) と batch (読む側) で同じ名前を参照させ、片側だけの改名を型で検出できるようにする。
 */
export const BATCH_JOB_INPUT_ENV_NAMES = {
  JOB_ID: 'JOB_ID',
  OUTPUT_CODEC: 'OUTPUT_CODEC',
} as const;

/**
 * 出力コーデックとして受け付ける値
 */
const VALID_OUTPUT_CODECS: readonly CodecType[] = ['h264', 'vp9', 'av1'];

/**
 * Batch ジョブの起動ごとに変わる入力
 *
 * テーブル名・バケット名・リージョンなど起動ごとに変わらない値はジョブ定義の environment が持つため、
 * ここには含めない。
 */
export interface BatchJobInput {
  /** ジョブID */
  jobId: string;
  /** 出力コーデック */
  outputCodec: CodecType;
}

/**
 * `SubmitJobCommand` の `containerOverrides.environment` に渡す要素
 */
export interface BatchEnvironmentVariable {
  name: string;
  value: string;
}

/**
 * Batch ジョブの入力を `containerOverrides.environment` 用の配列へ変換する
 *
 * @param input - 起動ごとの入力
 * @returns `{ name, value }` の配列
 */
export function toBatchEnvironment(input: BatchJobInput): BatchEnvironmentVariable[] {
  return [
    { name: BATCH_JOB_INPUT_ENV_NAMES.JOB_ID, value: input.jobId },
    { name: BATCH_JOB_INPUT_ENV_NAMES.OUTPUT_CODEC, value: input.outputCodec },
  ];
}

/**
 * 環境変数のレコードから Batch ジョブの入力を読み取り、検証する
 *
 * @param env - 環境変数のレコード (通常は `process.env`)
 * @returns 検証済みの入力
 * @throws {Error} 必須の環境変数が未設定の場合、または出力コーデックが不正な場合
 */
export function readBatchJobInput(env: Record<string, string | undefined>): BatchJobInput {
  const jobId = env[BATCH_JOB_INPUT_ENV_NAMES.JOB_ID]?.trim() ?? '';
  const outputCodec = env[BATCH_JOB_INPUT_ENV_NAMES.OUTPUT_CODEC]?.trim() ?? '';

  const missing: string[] = [];
  if (jobId.length === 0) {
    missing.push(BATCH_JOB_INPUT_ENV_NAMES.JOB_ID);
  }
  if (outputCodec.length === 0) {
    missing.push(BATCH_JOB_INPUT_ENV_NAMES.OUTPUT_CODEC);
  }
  if (missing.length > 0) {
    throw new Error(`${ERROR_MESSAGES.MISSING_ENV}: ${missing.join(', ')}`);
  }

  if (!VALID_OUTPUT_CODECS.includes(outputCodec as CodecType)) {
    throw new Error(ERROR_MESSAGES.INVALID_OUTPUT_CODEC);
  }

  return { jobId, outputCodec: outputCodec as CodecType };
}
