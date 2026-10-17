/**
 * UserRepository 契約テスト（実行エントリポイント）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に対して
 * user.repository.contract.ts の共有スペックを実行する。
 *
 * DynamoDB Local（DYNAMODB_ENDPOINT、未設定時は http://localhost:8000）への接続を前提とし、
 * 接続できない環境では自己スキップせずテストを失敗させる（決定的に検知するため）。
 */

import { DynamoDBUserRepository } from '../../src/repositories/user/dynamodb-user-repository.js';
import { InMemoryUserRepository } from '../../src/repositories/user/in-memory-user-repository.js';
import { defineUserRepositoryContract } from './user.repository.contract.js';
import { createDynamoDbLocalTarget, createInMemoryTarget } from './helpers/raw-store.js';

const inMemory = createInMemoryTarget();
defineUserRepositoryContract('InMemory', {
  ...inMemory.hooks,
  makeRepository: async () => new InMemoryUserRepository(inMemory.getStore()),
});

const dynamoDbLocal = createDynamoDbLocalTarget('contract-user');
defineUserRepositoryContract('DynamoDB Local', {
  ...dynamoDbLocal.hooks,
  makeRepository: async () => {
    const { docClient, tableName } = await dynamoDbLocal.getTarget();
    return new DynamoDBUserRepository(docClient, tableName);
  },
});
