/**
 * エラーメッセージ定数
 *
 * ユーザー向けエラーメッセージを一元管理する
 */
export const ERROR_MESSAGES = {
  MISSING_REQUIRED_FIELDS: '必須フィールドが不足しています',
  INVALID_CODEC: '無効なコーデックが指定されました',
  JOB_CREATION_FAILED: 'ジョブの作成に失敗しました',
} as const;
