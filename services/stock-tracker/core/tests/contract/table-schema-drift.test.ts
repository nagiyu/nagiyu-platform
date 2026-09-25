/**
 * テーブルスキーマ ドリフトガード
 *
 * infra/stock-tracker/lib/dynamodb-stack.ts（本番CDKスタック）を synth し、
 * 契約テストが使用する LOCAL_TABLE_SCHEMA（helpers/dynamodb-local.ts）と
 * KeySchema・AttributeDefinitions・GlobalSecondaryIndexes・BillingMode が一致することを検証する。
 * CDK側の定義が変更されローカルスキーマと乖離した場合、このテストが落ちて検知する。
 *
 * 正規化（属性名順・IndexName順ソート等）は `@nagiyu/aws/testing` の
 * `toComparableTableSchema` に委譲する（複数サービスで再利用するための共通関数）。
 *
 * synth はスタック構築のオーバーヘッドがあるため、it ごとに繰り返さず beforeAll で1回だけ行う。
 */

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { toComparableTableSchema, type TableSchemaLike } from '@nagiyu/aws/testing';
import { DynamoDBStack } from '../../../../../infra/stock-tracker/lib/dynamodb-stack';
import { LOCAL_TABLE_SCHEMA } from './helpers/dynamodb-local.js';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  TABLE_RESOURCE_COUNT_MISMATCH:
    'CDK synth 結果に AWS::DynamoDB::Table リソースがちょうど1つ存在しません',
} as const;

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

function synth(): Template {
  const app = new cdk.App();
  const stack = new DynamoDBStack(app, 'TestStockTrackerDynamoDBSchemaDrift', {
    environment: 'dev',
    env: STACK_ENV,
  });
  return Template.fromStack(stack);
}

function getTableProperties(template: Template): TableSchemaLike {
  const tableResources = template.findResources('AWS::DynamoDB::Table');
  const tables = Object.values(tableResources) as Array<{ Properties: TableSchemaLike }>;

  // テーブルが0件だと原因の分かりにくい TypeError（destructuring undefined）になるため、
  // 件数を検証してから取り出す。複数件でも「どれと比較すべきか」が不定になるため弾く。
  if (tables.length !== 1) {
    throw new Error(`${ERROR_MESSAGES.TABLE_RESOURCE_COUNT_MISMATCH}（実際: ${tables.length}件）`);
  }

  return tables[0].Properties;
}

describe('DynamoDB テーブルスキーマ ドリフトガード', () => {
  let actual: ReturnType<typeof toComparableTableSchema>;
  let expected: ReturnType<typeof toComparableTableSchema>;

  beforeAll(() => {
    actual = toComparableTableSchema(getTableProperties(synth()));
    expected = toComparableTableSchema(LOCAL_TABLE_SCHEMA);
  });

  it('GlobalSecondaryIndexes が1件以上synthされている（欠損正規化による誤検知回避のガード）', () => {
    // toComparableTableSchema は欠損を [] に正規化するため、CDK側の構造が変わって
    // GlobalSecondaryIndexes 自体が読めなくなった場合、actual が [] に退化し、
    // 以降の一致比較が「両方空配列だから一致」と誤って通ってしまう。それを防ぐ自明性チェック。
    expect(actual.GlobalSecondaryIndexes.length).toBeGreaterThan(0);
    expect(expected.GlobalSecondaryIndexes.length).toBeGreaterThan(0);
  });

  it('KeySchema（PK/SK）がLOCAL_TABLE_SCHEMAと一致する', () => {
    expect(actual.KeySchema).toEqual(expected.KeySchema);
  });

  it('AttributeDefinitionsがLOCAL_TABLE_SCHEMAと一致する（順序を問わない）', () => {
    expect(actual.AttributeDefinitions).toEqual(expected.AttributeDefinitions);
  });

  it('GlobalSecondaryIndexes（名前・キー・射影）がLOCAL_TABLE_SCHEMAと一致する（順序を問わない）', () => {
    expect(actual.GlobalSecondaryIndexes).toEqual(expected.GlobalSecondaryIndexes);
  });

  it('BillingModeがLOCAL_TABLE_SCHEMAと一致する（PAY_PER_REQUEST）', () => {
    expect(actual.BillingMode).toBe(expected.BillingMode);
  });
});
