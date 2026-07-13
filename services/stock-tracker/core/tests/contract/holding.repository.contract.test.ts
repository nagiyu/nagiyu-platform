/**
 * HoldingRepository 契約テスト（実行エントリポイント）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に対して
 * holding.repository.contract.ts の共有スペックを実行する。
 *
 * DynamoDB Local（DYNAMODB_ENDPOINT、未設定時は http://localhost:8000）への接続を前提とし、
 * 接続できない環境では自己スキップせずテストを失敗させる（決定的に検知するため）。
 */

import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryHoldingRepository } from '../../src/repositories/in-memory-holding.repository.js';
import { DynamoDBHoldingRepository } from '../../src/repositories/dynamodb-holding.repository.js';
import { defineHoldingRepositoryContract } from './holding.repository.contract.js';
import {
  createLocalDocClient,
  createLocalRawClient,
  createTable,
  deleteTable,
} from './helpers/dynamodb-local.js';

// --- InMemory 実装 ---

let inMemoryStore = new InMemorySingleTableStore();

defineHoldingRepositoryContract('InMemory', {
  makeRepository: async () => new InMemoryHoldingRepository(inMemoryStore),
  reset: async () => {
    inMemoryStore = new InMemorySingleTableStore();
  },
});

// --- DynamoDB Local 実装 ---

const dynamoDbLocalTableName = `contract-holding-${process.pid}-${Date.now()}`;
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

async function clearDynamoDbLocalTable(): Promise<void> {
  await ensureDynamoDbLocalTable();
  const docClient = dynamoDbLocalDocClient as DynamoDBDocumentClient;

  const scanResult = await docClient.send(new ScanCommand({ TableName: dynamoDbLocalTableName }));
  const items = scanResult.Items ?? [];

  for (const item of items) {
    await docClient.send(
      new DeleteCommand({
        TableName: dynamoDbLocalTableName,
        Key: { PK: item.PK, SK: item.SK },
      })
    );
  }
}

defineHoldingRepositoryContract('DynamoDB Local', {
  makeRepository: async () => {
    await ensureDynamoDbLocalTable();
    return new DynamoDBHoldingRepository(
      dynamoDbLocalDocClient as DynamoDBDocumentClient,
      dynamoDbLocalTableName
    );
  },
  reset: clearDynamoDbLocalTable,
  teardown: async () => {
    await ensureDynamoDbLocalTable();
    await deleteTable(dynamoDbLocalRawClient as DynamoDBClient, dynamoDbLocalTableName);
  },
});
