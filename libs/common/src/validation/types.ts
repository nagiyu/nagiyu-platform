/**
 * バリデーション結果
 */
export type ValidationResult = {
  /** バリデーション成功フラグ */
  valid: boolean;
  /** エラーメッセージ配列（valid が false の場合のみ） */
  errors?: string[];
};
