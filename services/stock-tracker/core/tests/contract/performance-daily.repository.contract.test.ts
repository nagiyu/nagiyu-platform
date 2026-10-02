/**
 * PerformanceDailyRepository 契約テスト（実行エントリポイント）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に対して
 * performance-daily.repository.contract.ts の共有スペックを実行する。
 */
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import {
  clearTable,
  createLocalDocClient,
  createLocalRawClient,
  deleteTable,
} from '@nagiyu/aws/testing';
import { InMemoryPerformanceDailyRepository } from '../../src/repositories/in-memory-performance-daily.repository.js';
import { DynamoDBPerformanceDailyRepository } from '../../src/repositories/dynamodb-performance-daily.repository.js';
import { definePerformanceDailyRepositoryContract } from './performance-daily.repository.contract.js';
import { createTable } from './helpers/dynamodb-local.js';

// --- InMemory 実装 ---

let inMemoryStore = new InMemorySingleTableStore();

definePerformanceDailyRepositoryContract('InMemory', {
  makeRepository: async () => new InMemoryPerformanceDailyRepository(inMemoryStore),
  reset: async () => {
    inMemoryStore = new InMemorySingleTableStore();
  },
});

// --- DynamoDB Local 実装 ---

const dynamoDbLocalTableName = `contract-performance-daily-${process.pid}-${Date.now()}`;
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

definePerformanceDailyRepositoryContract('DynamoDB Local', {
  makeRepository: async () => {
    await ensureDynamoDbLocalTable();
    return new DynamoDBPerformanceDailyRepository(
      dynamoDbLocalDocClient as DynamoDBDocumentClient,
      dynamoDbLocalTableName
    );
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
