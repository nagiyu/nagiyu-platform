/**
 * MembershipRepository 契約テスト（実行エントリポイント）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に対して
 * membership.repository.contract.ts の共有スペックを実行する。
 *
 * DynamoDB Local（DYNAMODB_ENDPOINT、未設定時は http://localhost:8000）への接続を前提とし、
 * 接続できない環境では自己スキップせずテストを失敗させる（決定的に検知するため）。
 */

import { DynamoDBMembershipRepository } from '../../src/repositories/membership/dynamodb-membership-repository.js';
import { InMemoryMembershipRepository } from '../../src/repositories/membership/in-memory-membership-repository.js';
import { defineMembershipRepositoryContract } from './membership.repository.contract.js';
import { createDynamoDbLocalTarget, createInMemoryTarget } from './helpers/raw-store.js';

const inMemory = createInMemoryTarget();
defineMembershipRepositoryContract('InMemory', {
  ...inMemory.hooks,
  makeRepository: async () => new InMemoryMembershipRepository(inMemory.getStore()),
});

const dynamoDbLocal = createDynamoDbLocalTarget('contract-membership');
defineMembershipRepositoryContract('DynamoDB Local', {
  ...dynamoDbLocal.hooks,
  makeRepository: async () => {
    const { docClient, tableName } = await dynamoDbLocal.getTarget();
    return new DynamoDBMembershipRepository(docClient, tableName);
  },
});
