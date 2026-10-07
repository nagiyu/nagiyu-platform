/**
 * UpdateCommand の入力から、更新対象の属性名と値を取り出すテスト用ヘルパー
 *
 * プレースホルダ名 (#n0 / :v0 等) や項目の順序に依存せず、
 * 「どの属性を、どの値で SET するか / REMOVE するか」だけを検証するために使う。
 */

export interface UpdateExpressionInput {
  UpdateExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
}

export interface ParsedUpdateExpression {
  /** SET 句の 属性名 → 値 */
  set: Record<string, unknown>;
  /** REMOVE 句の属性名 */
  remove: string[];
}

export function parseUpdateExpression(input: UpdateExpressionInput): ParsedUpdateExpression {
  const expression = input.UpdateExpression ?? '';
  const names = input.ExpressionAttributeNames ?? {};
  const values = input.ExpressionAttributeValues ?? {};

  const setMatch = expression.match(/SET (.*?)(?= REMOVE |$)/);
  const removeMatch = expression.match(/REMOVE (.*?)(?= SET |$)/);

  const set: Record<string, unknown> = {};
  if (setMatch) {
    for (const clause of setMatch[1].split(', ')) {
      const [nameKey, valueKey] = clause.split(' = ');
      set[names[nameKey]] = values[valueKey];
    }
  }
  const remove = removeMatch ? removeMatch[1].split(', ').map((nameKey) => names[nameKey]) : [];

  return { set, remove };
}
