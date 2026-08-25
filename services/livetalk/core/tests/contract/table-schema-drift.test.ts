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
import type { AttributeProjection } from '@nagiyu/aws';
import { LiveTalkDynamoDbStack } from '../../../../../infra/livetalk/lib/dynamodb-stack';
import { LOCAL_TABLE_SCHEMA } from './helpers/dynamodb-local.js';
import {
  PROFILE_GSI_INDEX_NAME,
  SAFETY_EVENT_GSI_INDEX_NAME,
  TOPIC_GSI_INDEX_NAME,
  STALE_GSI_INDEX_NAME,
  PROFILE_GSI_PROJECTION,
  SAFETY_EVENT_GSI_PROJECTION,
  TOPIC_GSI_PROJECTION,
  STALE_GSI_PROJECTION,
} from '../../src/mappers/keys.js';

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

  it('リポジトリが使う射影定数（mappers/keys.ts）がCDK synth結果の射影（キー属性・射影タイプ・NonKeyAttributes）と一致する', () => {
    // InMemory実装（in-memory-*.repository.ts）が queryByAttribute に渡す射影定数
    // （mappers/keys.ts の *_GSI_PROJECTION）を、CDK synth結果と直接突き合わせる。
    // 上記の GlobalSecondaryIndexes の一致確認とあわせて、
    // 「CDK ↔ LOCAL_TABLE_SCHEMA ↔ リポジトリが使う射影定数」の三者が
    // このドリフトガード1本で乖離なく保たれることを保証する。
    const { actual } = getComparable();

    const projectionByIndexName: Record<string, AttributeProjection> = {
      [PROFILE_GSI_INDEX_NAME]: PROFILE_GSI_PROJECTION,
      [SAFETY_EVENT_GSI_INDEX_NAME]: SAFETY_EVENT_GSI_PROJECTION,
      [TOPIC_GSI_INDEX_NAME]: TOPIC_GSI_PROJECTION,
      [STALE_GSI_INDEX_NAME]: STALE_GSI_PROJECTION,
    };

    // 定義済みのGSI名の集合そのものが一致することも確認する（GSI追加漏れ・命名ずれの検知）
    expect(Object.keys(projectionByIndexName).sort()).toEqual(
      actual.GlobalSecondaryIndexes.map((gsi) => gsi.IndexName).sort()
    );

    for (const gsi of actual.GlobalSecondaryIndexes) {
      const projection = projectionByIndexName[gsi.IndexName];

      expect(projection.type).toBe(gsi.Projection.ProjectionType);
      // GSI自身のキー属性名（パーティションキー・ソートキー）が一致すること
      expect([...projection.keyAttributeNames].sort()).toEqual(
        gsi.KeySchema.map((k) => k.AttributeName).sort()
      );
      // INCLUDE のときだけ非キー属性一覧を突き合わせる（KEYS_ONLY はキーのみのため対象外）
      if (projection.type === 'INCLUDE') {
        expect([...(projection.nonKeyAttributes ?? [])].sort()).toEqual(
          gsi.Projection.NonKeyAttributes ?? []
        );
      }
    }
  });
});
