/**
 * テーブルスキーマ ドリフトガード
 *
 * infra/stock-tracker/lib/dynamodb-stack.ts（本番CDKスタック）を synth し、
 * 契約テストが使用する LOCAL_TABLE_SCHEMA（helpers/dynamodb-local.ts）と
 * KeySchema・AttributeDefinitions・GlobalSecondaryIndexes・BillingMode が一致することを検証する。
 * CDK側の定義が変更されローカルスキーマと乖離した場合、このテストが落ちて検知する。
 */

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { DynamoDBStack } from '../../../../../infra/stock-tracker/lib/dynamodb-stack';
import { LOCAL_TABLE_SCHEMA } from './helpers/dynamodb-local.js';

interface KeySchemaElement {
  AttributeName: string;
  KeyType: string;
}

interface AttributeDefinition {
  AttributeName: string;
  AttributeType: string;
}

interface GlobalSecondaryIndex {
  IndexName: string;
  KeySchema: KeySchemaElement[];
  Projection: { ProjectionType: string };
}

interface DynamoDBTableProperties {
  KeySchema: KeySchemaElement[];
  AttributeDefinitions: AttributeDefinition[];
  GlobalSecondaryIndexes: GlobalSecondaryIndex[];
  BillingMode: string;
}

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

function synth(): Template {
  const app = new cdk.App();
  const stack = new DynamoDBStack(app, 'TestStockTrackerDynamoDBSchemaDrift', {
    environment: 'dev',
    env: STACK_ENV,
  });
  return Template.fromStack(stack);
}

function getTableProperties(template: Template): DynamoDBTableProperties {
  const tableResources = template.findResources('AWS::DynamoDB::Table');
  const [table] = Object.values(tableResources) as Array<{
    Properties: DynamoDBTableProperties;
  }>;
  return table.Properties;
}

function sortByAttributeName(list: AttributeDefinition[]): AttributeDefinition[] {
  return [...list].sort((a, b) => a.AttributeName.localeCompare(b.AttributeName));
}

function sortByIndexName(list: GlobalSecondaryIndex[]): GlobalSecondaryIndex[] {
  return [...list].sort((a, b) => a.IndexName.localeCompare(b.IndexName));
}

describe('DynamoDB テーブルスキーマ ドリフトガード', () => {
  it('KeySchema（PK/SK）がLOCAL_TABLE_SCHEMAと一致する', () => {
    const properties = getTableProperties(synth());

    expect(properties.KeySchema).toEqual(LOCAL_TABLE_SCHEMA.KeySchema);
  });

  it('AttributeDefinitionsがLOCAL_TABLE_SCHEMAと一致する（順序を問わない）', () => {
    const properties = getTableProperties(synth());

    expect(sortByAttributeName(properties.AttributeDefinitions)).toEqual(
      sortByAttributeName(LOCAL_TABLE_SCHEMA.AttributeDefinitions as AttributeDefinition[])
    );
  });

  it('GlobalSecondaryIndexes（名前・キー・射影）がLOCAL_TABLE_SCHEMAと一致する（順序を問わない）', () => {
    const properties = getTableProperties(synth());

    const actualGsis = sortByIndexName(properties.GlobalSecondaryIndexes).map((gsi) => ({
      IndexName: gsi.IndexName,
      KeySchema: gsi.KeySchema,
      Projection: gsi.Projection,
    }));
    const expectedGsis = sortByIndexName(
      LOCAL_TABLE_SCHEMA.GlobalSecondaryIndexes as GlobalSecondaryIndex[]
    ).map((gsi) => ({
      IndexName: gsi.IndexName,
      KeySchema: gsi.KeySchema,
      Projection: gsi.Projection,
    }));

    expect(actualGsis).toEqual(expectedGsis);
  });

  it('BillingModeがLOCAL_TABLE_SCHEMAと一致する（PAY_PER_REQUEST）', () => {
    const properties = getTableProperties(synth());

    expect(properties.BillingMode).toBe(LOCAL_TABLE_SCHEMA.BillingMode);
  });
});
