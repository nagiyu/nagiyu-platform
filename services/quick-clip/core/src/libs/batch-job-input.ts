import type { EmotionFilter } from './highlight-extractor.service.js';
import type { QuickClipBatchCommand } from './quick-clip-batch-runner.js';

/**
 * web が起動のたびに Batch ジョブへ渡す入力。
 *
 * テーブル名・バケット名・リージョンのように起動ごとに変わらない値は、
 * ジョブ定義の環境変数に任せるためここには含めない。
 */
export type QuickClipBatchJobInput = {
  command: QuickClipBatchCommand;
  /** ジョブID（英数字・アンダースコア・ハイフンのみ許可）。 */
  jobId: string;
  emotionFilter: EmotionFilter;
};

/** web が渡し、batch が読む環境変数名。両側で同じ名前を参照するための唯一の定義。 */
export const BATCH_JOB_ENV_NAMES = {
  COMMAND: 'BATCH_COMMAND',
  JOB_ID: 'JOB_ID',
  EMOTION_FILTER: 'EMOTION_FILTER',
} as const;

/** 感情フィルターとして受け付ける値。 */
export const EMOTION_FILTERS: readonly EmotionFilter[] = [
  'any',
  'laugh',
  'excite',
  'touch',
  'tension',
];

/** 感情フィルターが未指定のときの値。 */
export const DEFAULT_EMOTION_FILTER: EmotionFilter = 'any';

const BATCH_COMMANDS: readonly QuickClipBatchCommand[] = ['extract'];

// 英数字・アンダースコア・ハイフンのみ許可し、S3キー/パス生成で安全に扱える形式に制限する。
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

const ERROR_MESSAGES = {
  MISSING_ENV: '必要な環境変数が設定されていません',
  INVALID_JOB_ID: 'ジョブIDが不正です',
  INVALID_EMOTION_FILTER: 'EMOTION_FILTER の値が不正です',
} as const;

/**
 * Batch の `containerOverrides.environment` に渡す形へ変換する。
 *
 * @param input 起動ごとの入力
 */
export const toBatchJobEnvironment = (
  input: QuickClipBatchJobInput
): { name: string; value: string }[] => [
  { name: BATCH_JOB_ENV_NAMES.COMMAND, value: input.command },
  { name: BATCH_JOB_ENV_NAMES.JOB_ID, value: input.jobId },
  { name: BATCH_JOB_ENV_NAMES.EMOTION_FILTER, value: input.emotionFilter },
];

const normalize = (value: string | undefined): string => value?.trim() ?? '';

const isBatchCommand = (value: string): value is QuickClipBatchCommand =>
  (BATCH_COMMANDS as readonly string[]).includes(value);

const isEmotionFilter = (value: string): value is EmotionFilter =>
  (EMOTION_FILTERS as readonly string[]).includes(value);

/**
 * 環境変数から起動ごとの入力を読み取り、値を検証する。
 *
 * EMOTION_FILTER は未設定・空白のみのとき {@link DEFAULT_EMOTION_FILTER} にする。
 * ジョブ定義由来の値（テーブル名など）は読まない。
 *
 * @param env 環境変数のレコード（`process.env` 等）
 * @throws BATCH_COMMAND・JOB_ID が未設定、または値が不正なとき
 */
export const readBatchJobInput = (
  env: Readonly<Record<string, string | undefined>>
): QuickClipBatchJobInput => {
  const command = normalize(env[BATCH_JOB_ENV_NAMES.COMMAND]);
  const jobId = normalize(env[BATCH_JOB_ENV_NAMES.JOB_ID]);

  const missing: string[] = [];
  if (command.length === 0) {
    missing.push(BATCH_JOB_ENV_NAMES.COMMAND);
  }
  if (jobId.length === 0) {
    missing.push(BATCH_JOB_ENV_NAMES.JOB_ID);
  }
  if (missing.length > 0) {
    throw new Error(`${ERROR_MESSAGES.MISSING_ENV}: ${missing.join(', ')}`);
  }

  if (!isBatchCommand(command)) {
    throw new Error(`${ERROR_MESSAGES.MISSING_ENV}: ${BATCH_JOB_ENV_NAMES.COMMAND}`);
  }

  if (!JOB_ID_PATTERN.test(jobId)) {
    throw new Error(ERROR_MESSAGES.INVALID_JOB_ID);
  }

  const rawEmotionFilter = normalize(env[BATCH_JOB_ENV_NAMES.EMOTION_FILTER]);
  if (rawEmotionFilter.length === 0) {
    return { command, jobId, emotionFilter: DEFAULT_EMOTION_FILTER };
  }
  if (!isEmotionFilter(rawEmotionFilter)) {
    throw new Error(ERROR_MESSAGES.INVALID_EMOTION_FILTER);
  }

  return { command, jobId, emotionFilter: rawEmotionFilter };
};
