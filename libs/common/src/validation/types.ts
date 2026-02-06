/**
 * バリデーション結果
 */
export interface ValidationResult<T = unknown> {
  /** バリデーション成功フラグ */
  valid: boolean;
  /** エラーメッセージ配列（valid が false の場合のみ） */
  errors?: string[];
  /** バリデーション済みデータ（valid が true の場合のみ） */
  data?: T;
}
