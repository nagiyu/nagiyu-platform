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

/**
 * UpdateExpression を動的に生成
 *
 * @param updates - 更新するフィールドと値のマップ
 * @param options - オプション
 * @param options.autoUpdateTimestamp - UpdatedAt を自動更新するか（デフォルト: true）
 * @returns UpdateExpression と関連する AttributeNames, AttributeValues
 *
 * @example
 * ```typescript
 * const result = buildUpdateExpression({
 *   Name: 'New Name',
 *   Status: 'active'
 * });
 * // result.updateExpression: 'SET #name = :name, #status = :status, #updatedAt = :updatedAt'
 * // result.expressionAttributeNames: { '#name': 'Name', '#status': 'Status', '#updatedAt': 'UpdatedAt' }
 * // result.expressionAttributeValues: { ':name': 'New Name', ':status': 'active', ':updatedAt': 1234567890 }
 * ```
 */
export function buildUpdateExpression(
  updates: Record<string, unknown>,
  options: {
    autoUpdateTimestamp?: boolean;
  } = {}
): {
  updateExpression: string;
  expressionAttributeNames: Record<string, string>;
  expressionAttributeValues: Record<string, unknown>;
} {
  const { autoUpdateTimestamp = true } = options;

  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

  // 更新フィールドを処理
  for (const [key, value] of Object.entries(updates)) {
    const attrName = `#${key.toLowerCase()}`;
    const attrValue = `:${key.toLowerCase()}`;

    updateExpressions.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = value;
  }

  // タイムスタンプを自動更新
  if (autoUpdateTimestamp) {
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
    expressionAttributeValues[':updatedAt'] = Date.now();
  }

  return {
    updateExpression: `SET ${updateExpressions.join(', ')}`,
    expressionAttributeNames,
    expressionAttributeValues,
  };
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
