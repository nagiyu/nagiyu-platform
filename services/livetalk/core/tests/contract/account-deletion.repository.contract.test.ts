/**
 * AccountDeletionRepository 契約テスト（実行エントリポイント）
 *
 * InMemory 実装と実 DynamoDB 実装（DynamoDB Local）の双方に対して
 * account-deletion.repository.contract.ts の共有スペックを実行する。
 *
 * DynamoDB Local（DYNAMODB_ENDPOINT、未設定時は http://localhost:8000）への接続を前提とし、
 * 接続できない環境では自己スキップせずテストを失敗させる（決定的に検知するため）。
 */

import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { InMemorySingleTableStore, queryAllItems } from '@nagiyu/aws';
import {
  clearTable,
  createLocalDocClient,
  createLocalRawClient,
  deleteTable,
} from '@nagiyu/aws/testing';
import { InMemoryAccountDeletionRepository } from '../../src/repositories/in-memory-account-deletion.repository.js';
import { DynamoDBAccountDeletionRepository } from '../../src/repositories/dynamodb-account-deletion.repository.js';
import { InMemoryChatGuardRepository } from '../../src/repositories/in-memory-chat-guard.repository.js';
import { DynamoDBChatGuardRepository } from '../../src/repositories/dynamodb-chat-guard.repository.js';
import { defineAccountDeletionRepositoryContract } from './account-deletion.repository.contract.js';
import { createTable } from './helpers/dynamodb-local.js';

// --- InMemory 実装 ---

let inMemoryStore = new InMemorySingleTableStore();

defineAccountDeletionRepositoryContract('InMemory', {
  makeRepositories: async ({ ulid, nowMs }) => ({
    accountDeletion: new InMemoryAccountDeletionRepository(
      inMemoryStore,
      () => ulid,
      () => nowMs
    ),
    chatGuard: new InMemoryChatGuardRepository(inMemoryStore),
  }),
  seed: async (item) => {
    inMemoryStore.putByKey({ PK: String(item['PK']), SK: String(item['SK']) }, item);
  },
  listByPk: async (pk) => {
    const items: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    do {
      const page = inMemoryStore.query({ pk }, cursor ? { cursor } : undefined);
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor !== undefined);
    return items;
  },
  reset: async () => {
    inMemoryStore = new InMemorySingleTableStore();
  },
});

// --- DynamoDB Local 実装 ---

const dynamoDbLocalTableName = `contract-account-deletion-${process.pid}-${Date.now()}`;
let dynamoDbLocalRawClient: DynamoDBClient | undefined;
let dynamoDbLocalDocClient: DynamoDBDocumentClient | undefined;
let dynamoDbLocalTableReady: Promise<void> | undefined;

function ensureDynamoDbLocalTable(): Promise<void> {
  if (!dynamoDbLocalTableReady) {
    dynamoDbLocalRawClient = createLocalRawClient();
    dynamoDbLocalDocClient = createLocalDocClient();
    dynamoDbLocalTableReady = createTable(dynamoDbLocalRawClient, dynamoDbLocalTableName);
  }
  return dynamoDbLocalTableReady;
}

defineAccountDeletionRepositoryContract('DynamoDB Local', {
  makeRepositories: async ({ ulid, nowMs }) => {
    await ensureDynamoDbLocalTable();
    const docClient = dynamoDbLocalDocClient as DynamoDBDocumentClient;
    return {
      accountDeletion: new DynamoDBAccountDeletionRepository(
        docClient,
        dynamoDbLocalTableName,
        () => ulid,
        () => nowMs
      ),
      chatGuard: new DynamoDBChatGuardRepository(docClient, dynamoDbLocalTableName),
    };
  },
  seed: async (item) => {
    await ensureDynamoDbLocalTable();
    await (dynamoDbLocalDocClient as DynamoDBDocumentClient).send(
      new PutCommand({ TableName: dynamoDbLocalTableName, Item: item })
    );
  },
  listByPk: async (pk) => {
    await ensureDynamoDbLocalTable();
    return queryAllItems(dynamoDbLocalDocClient as DynamoDBDocumentClient, {
      TableName: dynamoDbLocalTableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'PK' },
      ExpressionAttributeValues: { ':pk': pk },
    });
  },
  reset: async () => {
    await ensureDynamoDbLocalTable();
    await clearTable(dynamoDbLocalDocClient as DynamoDBDocumentClient, dynamoDbLocalTableName);
  },
  teardown: async () => {
    await ensureDynamoDbLocalTable();
    await deleteTable(dynamoDbLocalRawClient as DynamoDBClient, dynamoDbLocalTableName);
  },
});
