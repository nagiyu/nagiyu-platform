/**
 * TopicRepository 契約テスト（実行エントリポイント）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に対して
 * topic.repository.contract.ts の共有スペックを実行する。
 *
 * DynamoDB Local（DYNAMODB_ENDPOINT、未設定時は http://localhost:8000）への接続を前提とし、
 * 接続できない環境では自己スキップせずテストを失敗させる（決定的に検知するため）。
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import { clearTable } from '@nagiyu/aws/testing';
import { InMemoryTopicRepository } from '../../src/repositories/in-memory-topic.repository.js';
import { DynamoDBTopicRepository } from '../../src/repositories/dynamodb-topic.repository.js';
import { defineTopicRepositoryContract } from './topic.repository.contract.js';
import {
  createLocalDocClient,
  createLocalRawClient,
  createTable,
  deleteTable,
} from './helpers/dynamodb-local.js';

// --- InMemory 実装 ---

let inMemoryStore = new InMemorySingleTableStore();

defineTopicRepositoryContract('InMemory', {
  makeRepository: async () => new InMemoryTopicRepository(inMemoryStore),
  reset: async () => {
    inMemoryStore = new InMemorySingleTableStore();
  },
});

// --- DynamoDB Local 実装 ---

const dynamoDbLocalTableName = `contract-topic-${process.pid}-${Date.now()}`;
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

defineTopicRepositoryContract('DynamoDB Local', {
  makeRepository: async () => {
    await ensureDynamoDbLocalTable();
    return new DynamoDBTopicRepository(
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
