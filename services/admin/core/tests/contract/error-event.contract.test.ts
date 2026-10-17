/**
 * ErrorEvent 契約テスト（実行エントリポイント）
 *
 * InMemory 実装と実 DynamoDB 実装（DynamoDB Local）の双方に対して
 * error-event.contract.ts の共有スペックを実行する。
 *
 * DynamoDB Local（DYNAMODB_ENDPOINT、未設定時は http://localhost:8000）への接続を前提とし、
 * 接続できない環境では自己スキップせずテストを失敗させる（決定的に検知するため）。
 */

import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBErrorEventWriter,
  InMemoryErrorEventWriter,
  InMemorySingleTableStore,
} from '@nagiyu/aws';
import {
  clearTable,
  createLocalDocClient,
  createLocalRawClient,
  deleteTable,
} from '@nagiyu/aws/testing';
import { DynamoDBErrorEventReader } from '../../src/errors/dynamodb-reader.js';
import { InMemoryErrorEventReader } from '../../src/errors/in-memory-reader.js';
import { defineErrorEventContract } from './error-event.contract.js';
import { createErrorEventsTable } from './helpers/dynamodb-local.js';

// --- InMemory 実装 ---

let inMemoryStore = new InMemorySingleTableStore();

defineErrorEventContract('InMemory', {
  makeFixture: async () => ({
    writer: new InMemoryErrorEventWriter(inMemoryStore),
    reader: new InMemoryErrorEventReader(inMemoryStore),
    putRawItem: async (item) => {
      inMemoryStore.putByKey({ PK: String(item.PK), SK: String(item.SK) }, item);
    },
    getRawItem: async (pk, sk) => inMemoryStore.get(pk, sk),
  }),
  reset: async () => {
    inMemoryStore = new InMemorySingleTableStore();
  },
});

// --- DynamoDB Local 実装 ---

const dynamoDbLocalTableName = `contract-error-events-${process.pid}-${Date.now()}`;
let dynamoDbLocalRawClient: DynamoDBClient | undefined;
let dynamoDbLocalDocClient: DynamoDBDocumentClient | undefined;
let dynamoDbLocalTableReady: Promise<void> | undefined;

function ensureDynamoDbLocalTable(): Promise<void> {
  if (!dynamoDbLocalTableReady) {
    dynamoDbLocalRawClient = createLocalRawClient();
    dynamoDbLocalDocClient = createLocalDocClient();
    dynamoDbLocalTableReady = createErrorEventsTable(
      dynamoDbLocalRawClient,
      dynamoDbLocalTableName
    );
  }
  return dynamoDbLocalTableReady;
}

defineErrorEventContract('DynamoDB Local', {
  makeFixture: async () => {
    await ensureDynamoDbLocalTable();
    const docClient = dynamoDbLocalDocClient as DynamoDBDocumentClient;
    return {
      writer: new DynamoDBErrorEventWriter(docClient, dynamoDbLocalTableName),
      reader: new DynamoDBErrorEventReader(docClient, dynamoDbLocalTableName),
      putRawItem: async (item) => {
        await docClient.send(new PutCommand({ TableName: dynamoDbLocalTableName, Item: item }));
      },
      getRawItem: async (pk, sk) => {
        const result = await docClient.send(
          new GetCommand({ TableName: dynamoDbLocalTableName, Key: { PK: pk, SK: sk } })
        );
        return result.Item;
      },
    };
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
