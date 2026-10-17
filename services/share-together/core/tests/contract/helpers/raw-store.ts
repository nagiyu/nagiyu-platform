/**
 * 契約テストの実行エントリが共有する、ストアの準備と生アイテムの読み書き
 *
 * 5 リポジトリの実行エントリで同じ準備（InMemory のストア差し替え、DynamoDB Local の
 * テーブル作成・クリア・削除）を繰り返さないための束ね役。
 * 旧形式のアイテムを直接書き込む／保存形式のまま読む操作を、両実装で同じ形で提供する。
 */

import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import {
  clearTable,
  createLocalDocClient,
  createLocalRawClient,
  deleteTable,
} from '@nagiyu/aws/testing';
import { createTable } from './dynamodb-local.js';

/** 契約スペックが実装を操作するためのフック（リポジトリの生成を除く共通部分） */
export interface RawStoreHooks {
  /** 各テスト前にストア／テーブルをクリーンな状態に戻す */
  reset: () => Promise<void>;
  /** 全テスト終了後の後始末（テーブル削除等） */
  teardown?: () => Promise<void>;
  /** 保存形式を直接指定して Item を書き込む（旧形式のデータを再現するために使う） */
  putRawItem: (item: Record<string, unknown>) => Promise<void>;
  /** 保存されている Item を保存形式のまま読む */
  getRawItem: (pk: string, sk: string) => Promise<Record<string, unknown> | undefined>;
}

/** InMemory 実装向けのストアとフック */
export interface InMemoryTarget {
  hooks: RawStoreHooks;
  /** 現在のストア（reset のたびに差し替わるため、リポジトリ生成の直前に取得する） */
  getStore: () => InMemorySingleTableStore;
}

/** DynamoDB Local 実装向けのクライアントとフック */
export interface DynamoDbLocalTarget {
  hooks: RawStoreHooks;
  /** リポジトリ生成に必要なクライアントとテーブル名（初回にテーブルを作成する） */
  getTarget: () => Promise<{ docClient: DynamoDBDocumentClient; tableName: string }>;
}

/** InMemory 実装向けのフックを作る */
export function createInMemoryTarget(): InMemoryTarget {
  let store = new InMemorySingleTableStore();

  return {
    getStore: () => store,
    hooks: {
      reset: async () => {
        store = new InMemorySingleTableStore();
      },
      putRawItem: async (item) => {
        store.put(item as Parameters<InMemorySingleTableStore['put']>[0]);
      },
      getRawItem: async (pk, sk) => store.get(pk, sk),
    },
  };
}

/**
 * DynamoDB Local 実装向けのフックを作る。
 *
 * @param tablePrefix - テーブル名の接頭辞。並列実行のジョブ同士で衝突しないよう、
 *   プロセス ID と時刻を付けて一意にする
 */
export function createDynamoDbLocalTarget(tablePrefix: string): DynamoDbLocalTarget {
  const tableName = `${tablePrefix}-${process.pid}-${Date.now()}`;
  let rawClient: DynamoDBClient | undefined;
  let docClient: DynamoDBDocumentClient | undefined;
  let tableReady: Promise<void> | undefined;

  const ensureTable = async (): Promise<{
    rawClient: DynamoDBClient;
    docClient: DynamoDBDocumentClient;
  }> => {
    if (!tableReady || !rawClient || !docClient) {
      rawClient = createLocalRawClient();
      docClient = createLocalDocClient();
      tableReady = createTable(rawClient, tableName);
    }
    await tableReady;
    return { rawClient, docClient };
  };

  return {
    getTarget: async () => ({ docClient: (await ensureTable()).docClient, tableName }),
    hooks: {
      reset: async () => {
        await clearTable((await ensureTable()).docClient, tableName);
      },
      teardown: async () => {
        await deleteTable((await ensureTable()).rawClient, tableName);
      },
      putRawItem: async (item) => {
        await (
          await ensureTable()
        ).docClient.send(new PutCommand({ TableName: tableName, Item: item }));
      },
      getRawItem: async (pk, sk) => {
        const result = await (
          await ensureTable()
        ).docClient.send(
          new GetCommand({ TableName: tableName, Key: { PK: pk, SK: sk }, ConsistentRead: true })
        );
        return result.Item;
      },
    },
  };
}
