import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';

/**
 * エラーメッセージ定数
 *
 * ユーザー向けエラーメッセージを一元管理する。
 * 汎用メッセージは `@nagiyu/common` の COMMON_ERROR_MESSAGES を踏襲し、
 * codec-converter 固有のメッセージのみを追加する。
 */
export const ERROR_MESSAGES = {
  ...COMMON_ERROR_MESSAGES,

  // ジョブ作成・投入
  MISSING_REQUIRED_FIELDS: '必須フィールドが不足しています',
  INVALID_CODEC: '無効なコーデックが指定されました',
  JOB_CREATION_FAILED: 'ジョブの作成に失敗しました',
  JOB_SUBMISSION_FAILED: 'ジョブの投入に失敗しました',
  JOB_FETCH_FAILED: 'ジョブの取得に失敗しました',
  JOB_INFO_FETCH_FAILED: 'ジョブ情報の取得に失敗しました',
  INVALID_STATUS: 'ジョブは既に実行中または完了しています',
  FILE_NOT_FOUND: '入力ファイルが見つかりません',
  INVALID_JOB_DEFINITION: 'ジョブ定義の選択に失敗しました',
} as const;
