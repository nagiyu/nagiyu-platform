/**
 * dev-sync バッチ エラーメッセージ定数
 */

export const ERROR_MESSAGES = {
  /** コピー先テーブルが "-dev" で終わらない場合のエラー */
  DEST_TABLE_NOT_DEV:
    'コピー先テーブルが "-dev" で終わっていません。prod テーブルへの誤書き込みを防ぐため処理を中止します。',
  /** ジョブ設定のバリデーションエラー */
  INVALID_JOB_CONFIG: 'ジョブ設定が不正です',
  /** gsiWindow 戦略で gsi 設定が未指定の場合 */
  GSI_CONFIG_REQUIRED: 'gsiWindow 戦略では gsi 設定が必須です',
  /** mirror 戦略でスキャン中にエラーが発生した場合 */
  SCAN_FAILED: 'prod テーブルのスキャンに失敗しました',
  /** upsert 処理中にエラーが発生した場合 */
  UPSERT_FAILED: 'dev テーブルへの upsert に失敗しました',
  /** 差分削除処理中にエラーが発生した場合 */
  DELETE_FAILED: 'dev テーブルの差分削除に失敗しました',
} as const;
