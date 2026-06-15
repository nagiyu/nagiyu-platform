/**
 * dev-sync バッチ エラーメッセージ定数
 */

export const ERROR_MESSAGES = {
  /** コピー先テーブルが "-dev" で終わらない場合のエラー */
  DEST_TABLE_NOT_DEV:
    'コピー先テーブルが "-dev" で終わっていません。prod テーブルへの誤書き込みを防ぐため処理を中止します。',
  /** ジョブ設定のバリデーションエラー */
  INVALID_JOB_CONFIG: 'ジョブ設定が不正です',
  /** イベント入力のバリデーションエラー */
  INVALID_EVENT_INPUT: 'イベント入力のバリデーションに失敗しました',
  /** gsiWindow 戦略で gsi 設定が未指定の場合 */
  GSI_CONFIG_REQUIRED: 'gsiWindow 戦略では gsi 設定が必須です',
  /** mirror 戦略でスキャン中にエラーが発生した場合 */
  SCAN_FAILED: 'prod テーブルのスキャンに失敗しました',
  /** upsert 処理中にエラーが発生した場合 */
  UPSERT_FAILED: 'dev テーブルへの upsert に失敗しました',
  /** 差分削除処理中にエラーが発生した場合 */
  DELETE_FAILED: 'dev テーブルの差分削除に失敗しました',
  /** gsiWindow 戦略で delete=on を指定した場合のエラー（gsiWindow は削除しない） */
  GSI_WINDOW_DELETE_NOT_ALLOWED:
    'gsiWindow 戦略では delete="on" は指定できません。gsiWindow は削除を行わない戦略です。',
  /** mirror 戦略で gsi を指定した場合のエラー */
  MIRROR_GSI_NOT_ALLOWED: 'mirror 戦略では gsi 設定は使用できません。gsi は gsiWindow 戦略専用です。',
  /** mirror 戦略で scope が未指定の場合のエラー */
  MIRROR_SCOPE_REQUIRED: 'mirror 戦略では scope の指定が必須です。',
} as const;
