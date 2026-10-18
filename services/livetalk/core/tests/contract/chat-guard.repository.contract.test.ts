/**
 * ChatGuardRepository 契約テスト（実行エントリポイント）
 *
 * InMemory 実装と実 DynamoDB 実装（DynamoDB Local）の双方に対して
 * chat-guard.repository.contract.ts の共有スペックを実行する。
 *
 * DynamoDB Local（DYNAMODB_ENDPOINT、未設定時は http://localhost:8000）への接続を前提とし、
 * 接続できない環境では自己スキップせずテストを失敗させる（決定的に検知するため）。
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
import { InMemoryChatGuardRepository } from '../../src/repositories/in-memory-chat-guard.repository.js';
import { DynamoDBChatGuardRepository } from '../../src/repositories/dynamodb-chat-guard.repository.js';
import { defineChatGuardRepositoryContract } from './chat-guard.repository.contract.js';
import { createTable } from './helpers/dynamodb-local.js';

// --- InMemory 実装 ---

let inMemoryStore = new InMemorySingleTableStore();

defineChatGuardRepositoryContract('InMemory', {
  makeRepository: async () => new InMemoryChatGuardRepository(inMemoryStore),
  reset: async () => {
    inMemoryStore = new InMemorySingleTableStore();
  },
});

// --- DynamoDB Local 実装 ---

const dynamoDbLocalTableName = `contract-chat-guard-${process.pid}-${Date.now()}`;
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

defineChatGuardRepositoryContract('DynamoDB Local', {
  makeRepository: async () => {
    await ensureDynamoDbLocalTable();
    return new DynamoDBChatGuardRepository(
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
