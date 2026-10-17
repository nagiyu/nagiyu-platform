/**
 * UserRepository 契約テスト (実行エントリポイント)
 *
 * InMemory 実装と実 DynamoDB 実装 (DynamoDB Local) の双方に対して
 * user.repository.contract.ts の共有スペックを実行する。
 *
 * DynamoDB Local (DYNAMODB_ENDPOINT、未設定時は http://localhost:8000) への接続を前提とし、
 * 接続できない環境では自己スキップせずテストを失敗させる (決定的に検知するため)。
 */

import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import { createLocalDocClient, createLocalRawClient, deleteTable } from '@nagiyu/aws/testing';
import { InMemoryUserRepository } from '../../src/repositories/in-memory-user-repository';
import { DynamoDBUserRepository } from '../../src/repositories/dynamodb-user-repository';
import { defineUserRepositoryContract } from './user.repository.contract';
import { clearUsersTable, createTable } from './helpers/dynamodb-local';

// --- InMemory 実装 ---

let inMemoryStore = new InMemorySingleTableStore();

defineUserRepositoryContract('InMemory', {
  makeRepository: async () => new InMemoryUserRepository(inMemoryStore),
  reset: async () => {
    inMemoryStore = new InMemorySingleTableStore();
  },
  putRawItem: async (item) => {
    inMemoryStore.putByKey({ userId: item.userId as string }, item);
  },
  getRawItem: async (userId) => inMemoryStore.getByKey({ userId }),
});

// --- DynamoDB Local 実装 ---

const dynamoDbLocalTableName = `contract-auth-users-${process.pid}-${Date.now()}`;
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

defineUserRepositoryContract('DynamoDB Local', {
  makeRepository: async () => {
    await ensureDynamoDbLocalTable();
    return new DynamoDBUserRepository(
      dynamoDbLocalDocClient as DynamoDBDocumentClient,
      dynamoDbLocalTableName
    );
  },
  reset: async () => {
    await ensureDynamoDbLocalTable();
    await clearUsersTable(dynamoDbLocalDocClient as DynamoDBDocumentClient, dynamoDbLocalTableName);
  },
  putRawItem: async (item) => {
    await ensureDynamoDbLocalTable();
    await (dynamoDbLocalDocClient as DynamoDBDocumentClient).send(
      new PutCommand({ TableName: dynamoDbLocalTableName, Item: item })
    );
  },
  getRawItem: async (userId) => {
    await ensureDynamoDbLocalTable();
    const result = await (dynamoDbLocalDocClient as DynamoDBDocumentClient).send(
      new GetCommand({ TableName: dynamoDbLocalTableName, Key: { userId }, ConsistentRead: true })
    );
    return result.Item;
  },
  teardown: async () => {
    await ensureDynamoDbLocalTable();
    await deleteTable(dynamoDbLocalRawClient as DynamoDBClient, dynamoDbLocalTableName);
  },
});
