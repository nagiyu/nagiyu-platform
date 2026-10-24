/**
 * web が AWS Batch のジョブへ渡す入力の定義
 *
 * 渡す側 (web) と読む側 (batch) の変数名・値の形を 1 箇所に集約し、どちらかだけの変更を型で検出できるようにする。
 * 起動ごとに変わらない値 (テーブル名・リージョン等) はジョブ定義側で設定するため、ここには含めない。
 */

/**
 * ジョブへ渡す環境変数の名前
 */
export const JOB_INPUT_ENV_NAMES = {
  USER_ID: 'USER_ID',
  VIDEO_IDS: 'VIDEO_IDS',
  MYLIST_NAME: 'MYLIST_NAME',
  ENCRYPTED_USER_SESSION: 'ENCRYPTED_USER_SESSION',
} as const;

/**
 * ジョブ入力のエラーメッセージ
 */
export const JOB_INPUT_ERROR_MESSAGES = {
  INVALID_PARAMETERS: 'ジョブパラメータが不正です',
  INVALID_VIDEO_IDS: 'VIDEO_IDS は動画 ID の文字列配列の JSON である必要があります',
} as const;

/**
 * マイリスト登録ジョブの起動ごとの入力
 */
export interface MylistRegistrationJobInput {
  /** ユーザー ID */
  userId: string;
  /** 登録する動画 ID のリスト */
  videoIds: string[];
  /** マイリスト名 */
  mylistName: string;
  /** 暗号化済みの user_session (JSON 文字列) */
  encryptedUserSession: string;
}

/**
 * `SubmitJobCommand` の `containerOverrides.environment` の要素
 */
export interface JobEnvironmentVariable {
  name: string;
  value: string;
}

/**
 * 環境変数のレコード
 */
export type JobEnvironmentRecord = Readonly<Record<string, string | undefined>>;

/**
 * 読み取り時のオプション
 */
export interface ParseJobInputOptions {
  /**
   * MYLIST_NAME が空のときに使うマイリスト名
   *
   * 既定名は実行時刻を含むため、読む側が呼び出し時点の値を渡す。
   */
  defaultMylistName: string;
}

/**
 * 入力を `containerOverrides.environment` の形に変換する (web 用)
 *
 * VIDEO_IDS は環境変数が文字列しか持てないため JSON 文字列にする。
 */
export function toJobEnvironment(input: MylistRegistrationJobInput): JobEnvironmentVariable[] {
  return [
    { name: JOB_INPUT_ENV_NAMES.USER_ID, value: input.userId },
    { name: JOB_INPUT_ENV_NAMES.VIDEO_IDS, value: JSON.stringify(input.videoIds) },
    { name: JOB_INPUT_ENV_NAMES.MYLIST_NAME, value: input.mylistName },
    { name: JOB_INPUT_ENV_NAMES.ENCRYPTED_USER_SESSION, value: input.encryptedUserSession },
  ];
}

function parseVideoIds(json: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(JOB_INPUT_ERROR_MESSAGES.INVALID_VIDEO_IDS, { cause: error });
  }

  if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
    throw new Error(JOB_INPUT_ERROR_MESSAGES.INVALID_VIDEO_IDS);
  }

  return parsed;
}

/**
 * 環境変数のレコードからジョブの入力を読み取って検証する (batch 用)
 *
 * @throws USER_ID / ENCRYPTED_USER_SESSION が空、または VIDEO_IDS が空配列・不正な JSON のとき
 */
export function parseJobInput(
  env: JobEnvironmentRecord,
  options: ParseJobInputOptions
): MylistRegistrationJobInput {
  const userId = env[JOB_INPUT_ENV_NAMES.USER_ID] || '';
  const encryptedUserSession = env[JOB_INPUT_ENV_NAMES.ENCRYPTED_USER_SESSION] || '';
  const mylistName = env[JOB_INPUT_ENV_NAMES.MYLIST_NAME] || options.defaultMylistName;
  const videoIds = parseVideoIds(env[JOB_INPUT_ENV_NAMES.VIDEO_IDS] || '[]');

  if (!userId || !encryptedUserSession || videoIds.length === 0) {
    throw new Error(JOB_INPUT_ERROR_MESSAGES.INVALID_PARAMETERS);
  }

  return { userId, videoIds, mylistName, encryptedUserSession };
}
