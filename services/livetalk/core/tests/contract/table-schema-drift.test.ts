/**
 * テーブルスキーマ ドリフトガード
 *
 * infra/livetalk/lib/dynamodb-stack.ts（本番CDKスタック）を synth し、
 * 契約テストが使用する LOCAL_TABLE_SCHEMA（helpers/dynamodb-local.ts）と
 * KeySchema・AttributeDefinitions・GlobalSecondaryIndexes（射影タイプ・NonKeyAttributes を含む）・
 * BillingMode が一致することを検証する。
 *
 * livetalk は GSI の射影を KEYS_ONLY / INCLUDE に絞っており（PII 除外・冗長属性除外のため）、
 * ここが本番定義とローカルスキーマの乖離の温床になりやすい。よって射影タイプと
 * NonKeyAttributes まで突き合わせる（stock-tracker の ALL 射影より厳密に検証する）。
 */

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { toComparableTableSchema, type TableSchemaLike } from '@nagiyu/aws/testing';
import { LiveTalkDynamoDbStack } from '../../../../../infra/livetalk/lib/dynamodb-stack';
import { LOCAL_TABLE_SCHEMA } from './helpers/dynamodb-local.js';

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

function synth(): Template {
  const app = new cdk.App();
  const stack = new LiveTalkDynamoDbStack(app, 'TestLiveTalkDynamoDBSchemaDrift', {
    environment: 'dev',
    env: STACK_ENV,
  });
  return Template.fromStack(stack);
}

function getTableProperties(template: Template): TableSchemaLike {
  const tableResources = template.findResources('AWS::DynamoDB::Table');
  const [table] = Object.values(tableResources) as Array<{ Properties: TableSchemaLike }>;
  return table.Properties;
}

function getComparable(): {
  actual: ReturnType<typeof toComparableTableSchema>;
  expected: ReturnType<typeof toComparableTableSchema>;
} {
  return {
    actual: toComparableTableSchema(getTableProperties(synth())),
    expected: toComparableTableSchema(LOCAL_TABLE_SCHEMA),
  };
}

describe('DynamoDB テーブルスキーマ ドリフトガード', () => {
  it('KeySchema（PK/SK）がLOCAL_TABLE_SCHEMAと一致する', () => {
    const { actual, expected } = getComparable();

    expect(actual.KeySchema).toEqual(expected.KeySchema);
  });

  it('AttributeDefinitions（属性型を含む）がLOCAL_TABLE_SCHEMAと一致する（順序を問わない）', () => {
    const { actual, expected } = getComparable();

    expect(actual.AttributeDefinitions).toEqual(expected.AttributeDefinitions);
  });

  it('GlobalSecondaryIndexes（名前・キー・射影タイプ・NonKeyAttributes）がLOCAL_TABLE_SCHEMAと一致する（順序を問わない）', () => {
    const { actual, expected } = getComparable();

    expect(actual.GlobalSecondaryIndexes).toEqual(expected.GlobalSecondaryIndexes);
  });

  it('BillingModeがLOCAL_TABLE_SCHEMAと一致する（PAY_PER_REQUEST）', () => {
    const { actual, expected } = getComparable();

    expect(actual.BillingMode).toBe(expected.BillingMode);
  });
});
