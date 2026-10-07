/**
 * UpdateCommand の入力から、更新対象の属性名と値を取り出すテスト用ヘルパー
 *
 * プレースホルダ名 (#n0 / :v0 等) や項目の順序に依存せず、
 * 「どの属性を、どの値で SET するか / REMOVE するか」だけを検証するために使う。
 * 解決できないプレースホルダや、どの式からも参照されない名前・値があれば throw する。
 * DynamoDB はどちらもエラーにするが、モックした送信ではテストが通ってしまうため。
 */

export interface UpdateExpressionInput {
  UpdateExpression?: string;
  ConditionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
}

export interface ParsedUpdateExpression {
  /** SET 句の属性名 → 値 */
  set: Record<string, unknown>;
  /** REMOVE 句の属性名 */
  remove: string[];
}

function assertPlaceholders(input: UpdateExpressionInput): void {
  const expressions = `${input.UpdateExpression ?? ''} ${input.ConditionExpression ?? ''}`;
  const usedNames = new Set(expressions.match(/#\w+/g) ?? []);
  const usedValues = new Set(expressions.match(/:\w+/g) ?? []);
  const names = Object.keys(input.ExpressionAttributeNames ?? {});
  const values = Object.keys(input.ExpressionAttributeValues ?? {});

  const unresolved = [
    ...[...usedNames].filter((key) => !names.includes(key)),
    ...[...usedValues].filter((key) => !values.includes(key)),
  ];
  const unused = [
    ...names.filter((key) => !usedNames.has(key)),
    ...values.filter((key) => !usedValues.has(key)),
  ];
  if (unresolved.length > 0 || unused.length > 0) {
    throw new Error(
      `プレースホルダが不整合です: 未解決=${unresolved.join(',')} 未使用=${unused.join(',')}`
    );
  }
}

/**
 * @param input - 送信した UpdateCommand の input
 * @returns SET / REMOVE する属性
 */
export function parseUpdateExpression(input: UpdateExpressionInput): ParsedUpdateExpression {
  assertPlaceholders(input);

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
