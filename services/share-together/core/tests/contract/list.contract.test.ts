/**
 * ListRepository 契約テスト（実行エントリポイント）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に対して
 * list.repository.contract.ts の共有スペックを実行する。
 *
 * DynamoDB Local（DYNAMODB_ENDPOINT、未設定時は http://localhost:8000）への接続を前提とし、
 * 接続できない環境では自己スキップせずテストを失敗させる（決定的に検知するため）。
 */

import { DynamoDBListRepository } from '../../src/repositories/list/dynamodb-list-repository.js';
import { InMemoryListRepository } from '../../src/repositories/list/in-memory-list-repository.js';
import { defineListRepositoryContract } from './list.repository.contract.js';
import { createDynamoDbLocalTarget, createInMemoryTarget } from './helpers/raw-store.js';

const inMemory = createInMemoryTarget();
defineListRepositoryContract('InMemory', {
  ...inMemory.hooks,
  makeRepository: async () => new InMemoryListRepository(inMemory.getStore()),
});

const dynamoDbLocal = createDynamoDbLocalTarget('contract-list');
defineListRepositoryContract('DynamoDB Local', {
  ...dynamoDbLocal.hooks,
  makeRepository: async () => {
    const { docClient, tableName } = await dynamoDbLocal.getTarget();
    return new DynamoDBListRepository(docClient, tableName);
  },
});
