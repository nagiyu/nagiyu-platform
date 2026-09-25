/**
 * ProfileRepository 契約テスト（実行エントリポイント）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に対して
 * profile.repository.contract.ts の共有スペックを実行する。
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
import { InMemoryProfileRepository } from '../../src/repositories/in-memory-profile.repository.js';
import { DynamoDBProfileRepository } from '../../src/repositories/dynamodb-profile.repository.js';
import { InMemorySafetyEventRepository } from '../../src/repositories/in-memory-safety-event.repository.js';
import { DynamoDBSafetyEventRepository } from '../../src/repositories/dynamodb-safety-event.repository.js';
import { defineProfileRepositoryContract } from './profile.repository.contract.js';
import { createTable } from './helpers/dynamodb-local.js';

// --- InMemory 実装 ---

let inMemoryStore = new InMemorySingleTableStore();

defineProfileRepositoryContract('InMemory', {
  makeRepository: async () => new InMemoryProfileRepository(inMemoryStore),
  reset: async () => {
    inMemoryStore = new InMemorySingleTableStore();
  },
  putNonProfileItem: async (userId: string) => {
    const safetyEventRepo = new InMemorySafetyEventRepository(inMemoryStore);
    await safetyEventRepo.create({
      UserID: userId,
      CharacterID: 'hiyori',
      Trigger: 'input_keyword',
      DetectedPattern: 'contract-test',
      InputText: 'x',
      ResponseText: 'y',
    });
  },
});

// --- DynamoDB Local 実装 ---

const dynamoDbLocalTableName = `contract-profile-${process.pid}-${Date.now()}`;
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

defineProfileRepositoryContract('DynamoDB Local', {
  makeRepository: async () => {
    await ensureDynamoDbLocalTable();
    return new DynamoDBProfileRepository(
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
  putNonProfileItem: async (userId: string) => {
    await ensureDynamoDbLocalTable();
    const safetyEventRepo = new DynamoDBSafetyEventRepository(
      dynamoDbLocalDocClient as DynamoDBDocumentClient,
      dynamoDbLocalTableName
    );
    await safetyEventRepo.create({
      UserID: userId,
      CharacterID: 'hiyori',
      Trigger: 'input_keyword',
      DetectedPattern: 'contract-test',
      InputText: 'x',
      ResponseText: 'y',
    });
  },
});
