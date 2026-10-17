/**
 * PushSubscriptionRepository 契約テスト (実行エントリポイント)
 *
 * InMemory 実装と DynamoDB Local 実装の双方に、同じ振る舞いの仕様を通す。
 * DynamoDB Local (DYNAMODB_ENDPOINT、未設定時は http://localhost:8000) への接続が前提で、
 * 接続できない環境では自己スキップせず失敗させる。
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
import {
  DynamoDBPushSubscriptionRepository,
  InMemoryPushSubscriptionRepository,
} from '../../src/notify/subscription-repository.js';
import { defineSubscriptionRepositoryContract } from './subscription.repository.contract.js';
import { createAdminTable } from './helpers/dynamodb-local.js';

// --- InMemory 実装 ---

let inMemoryStore = new InMemorySingleTableStore();

defineSubscriptionRepositoryContract('InMemory', {
  makeRepository: async () => new InMemoryPushSubscriptionRepository(inMemoryStore),
  reset: async () => {
    inMemoryStore = new InMemorySingleTableStore();
  },
  putRawItem: async (item) => {
    inMemoryStore.put(item as Parameters<InMemorySingleTableStore['put']>[0]);
  },
  getRawItem: async (pk, sk) => inMemoryStore.get(pk, sk),
});

// --- DynamoDB Local 実装 ---

const tableName = `contract-admin-subscription-${process.pid}-${Date.now()}`;
let rawClient: DynamoDBClient | undefined;
let docClient: DynamoDBDocumentClient | undefined;
let tableReady: Promise<void> | undefined;

function ensureTable(): Promise<void> {
  if (!tableReady) {
    rawClient = createLocalRawClient();
    docClient = createLocalDocClient();
    tableReady = createAdminTable(rawClient, tableName);
  }
  return tableReady;
}

defineSubscriptionRepositoryContract('DynamoDB Local', {
  makeRepository: async () => {
    await ensureTable();
    return new DynamoDBPushSubscriptionRepository(docClient as DynamoDBDocumentClient, tableName);
  },
  reset: async () => {
    await ensureTable();
    await clearTable(docClient as DynamoDBDocumentClient, tableName);
  },
  teardown: async () => {
    await ensureTable();
    await deleteTable(rawClient as DynamoDBClient, tableName);
  },
  putRawItem: async (item) => {
    await ensureTable();
    await (docClient as DynamoDBDocumentClient).send(
      new PutCommand({ TableName: tableName, Item: item })
    );
  },
  getRawItem: async (pk, sk) => {
    await ensureTable();
    const result = await (docClient as DynamoDBDocumentClient).send(
      new GetCommand({ TableName: tableName, Key: { PK: pk, SK: sk }, ConsistentRead: true })
    );
    return result.Item;
  },
});
