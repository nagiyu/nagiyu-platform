/**
 * DynamoDB Repository ヘルパー関数
 *
 * DynamoDB操作を簡略化するヘルパー関数を提供
 */

import type {
  PutCommandInput,
  UpdateCommandInput,
  DeleteCommandInput,
} from '@aws-sdk/lib-dynamodb';

/** 属性を削除 (REMOVE 句) することを示すマーカー */
export const REMOVE_ATTRIBUTE: unique symbol = Symbol('REMOVE_ATTRIBUTE');

/** buildUpdateExpression の戻り値。UpdateCommand の入力にそのまま展開できる */
export interface UpdateExpressionParts {
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  /** 値が 1 つもない場合 (REMOVE のみ) はキーごと省略する。DynamoDB は空マップを拒否するため */
  ExpressionAttributeValues?: Record<string, unknown>;
}

/** buildUpdateExpression のオプション */
export interface BuildUpdateExpressionOptions {
  /** 更新日時の属性名と値。省略時は付与しない。値の形式は呼び出し側が決める */
  timestamp?: { attributeName: string; value: unknown };
  /** fields に更新項目がなくても、timestamp があればそれだけを更新する式を返す */
  updateTimestampWhenEmpty?: boolean;
}

/**
 * UpdateCommand 用の UpdateExpression 一式を生成
 *
 * - 値が undefined のフィールドはスキップする
 * - 値が REMOVE_ATTRIBUTE のフィールドは REMOVE 句に入れる
 * - それ以外 (null / '' / 0 / false を含む) は SET 句に入れる
 *
 * undefined をスキップするのは、共有クライアントが undefined の値をマップから落とすため。
 * 式にプレースホルダだけが残ると DynamoDB がエラーにする。
 *
 * プレースホルダは使用したフィールドごとに連番 (#n0 / :v0 ...) を振る。
 * 呼び出し側が追加する固定名 (#pk 等) と衝突しない。
 *
 * @param fields - 属性名と値のマップ (挿入順に処理する)
 * @param options - タイムスタンプ付与などのオプション
 * @returns 更新式一式。更新項目がなければ null (timestamp は更新項目に数えない)
 *
 * @example
 * ```typescript
 * const parts = buildUpdateExpression(
 *   { Name: '新しい名前', Memo: REMOVE_ATTRIBUTE, Skip: undefined },
 *   { timestamp: { attributeName: 'UpdatedAt', value: Date.now() } }
 * );
 * // parts.UpdateExpression: 'SET #n0 = :v0, #n2 = :v1 REMOVE #n1'
 * // parts.ExpressionAttributeNames: { '#n0': 'Name', '#n1': 'Memo', '#n2': 'UpdatedAt' }
 * // parts.ExpressionAttributeValues: { ':v0': '新しい名前', ':v1': 1234567890 }
 * ```
 */
export function buildUpdateExpression(
  fields: Record<string, unknown>,
  options: BuildUpdateExpressionOptions = {}
): UpdateExpressionParts | null {
  const { timestamp, updateTimestampWhenEmpty = false } = options;

  const setClauses: string[] = [];
  const removeClauses: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  let index = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }
    const nameKey = `#n${index}`;
    names[nameKey] = key;
    if (value === REMOVE_ATTRIBUTE) {
      removeClauses.push(nameKey);
    } else {
      const valueKey = `:v${index}`;
      setClauses.push(`${nameKey} = ${valueKey}`);
      values[valueKey] = value;
    }
    index++;
  }

  if (setClauses.length === 0 && removeClauses.length === 0) {
    if (!(updateTimestampWhenEmpty && timestamp)) {
      return null;
    }
  }

  if (timestamp) {
    const nameKey = `#n${index}`;
    const valueKey = `:v${index}`;
    setClauses.push(`${nameKey} = ${valueKey}`);
    names[nameKey] = timestamp.attributeName;
    values[valueKey] = timestamp.value;
  }

  const clauses: string[] = [];
  if (setClauses.length > 0) {
    clauses.push(`SET ${setClauses.join(', ')}`);
  }
  if (removeClauses.length > 0) {
    clauses.push(`REMOVE ${removeClauses.join(', ')}`);
  }

  const parts: UpdateExpressionParts = {
    UpdateExpression: clauses.join(' '),
    ExpressionAttributeNames: names,
  };
  if (Object.keys(values).length > 0) {
    parts.ExpressionAttributeValues = values;
  }
  return parts;
}

/**
 * 条件付きPUT（存在しない場合のみ作成）の設定を生成
 *
 * @param input - PutCommand の基本設定
 * @returns attribute_not_exists 条件を追加した PutCommandInput
 *
 * @example
 * ```typescript
 * const input = conditionalPut({
 *   TableName: 'MyTable',
 *   Item: { PK: 'USER#123', SK: 'PROFILE', Name: 'John' }
 * });
 * // input.ConditionExpression: 'attribute_not_exists(PK)'
 * ```
 */
export function conditionalPut(input: PutCommandInput): PutCommandInput {
  return {
    ...input,
    ConditionExpression: 'attribute_not_exists(PK)',
  };
}

/**
 * 条件付きUPDATE（存在する場合のみ更新）の設定を生成
 *
 * @param input - UpdateCommand の基本設定
 * @returns attribute_exists 条件を追加した UpdateCommandInput
 *
 * @example
 * ```typescript
 * const input = conditionalUpdate({
 *   TableName: 'MyTable',
 *   Key: { PK: 'USER#123', SK: 'PROFILE' },
 *   UpdateExpression: 'SET #name = :name',
 *   ExpressionAttributeNames: { '#name': 'Name' },
 *   ExpressionAttributeValues: { ':name': 'John' }
 * });
 * // input.ConditionExpression: 'attribute_exists(PK)'
 * ```
 */
export function conditionalUpdate(input: UpdateCommandInput): UpdateCommandInput {
  return {
    ...input,
    ConditionExpression: 'attribute_exists(PK)',
  };
}

/**
 * 条件付きDELETE（存在する場合のみ削除）の設定を生成
 *
 * @param input - DeleteCommand の基本設定
 * @returns attribute_exists 条件を追加した DeleteCommandInput
 *
 * @example
 * ```typescript
 * const input = conditionalDelete({
 *   TableName: 'MyTable',
 *   Key: { PK: 'USER#123', SK: 'PROFILE' }
 * });
 * // input.ConditionExpression: 'attribute_exists(PK)'
 * ```
 */
export function conditionalDelete(input: DeleteCommandInput): DeleteCommandInput {
  return {
    ...input,
    ConditionExpression: 'attribute_exists(PK)',
  };
}
