/**
 * TodoRepository 契約テスト（実行エントリポイント）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に対して
 * todo.repository.contract.ts の共有スペックを実行する。
 *
 * DynamoDB Local（DYNAMODB_ENDPOINT、未設定時は http://localhost:8000）への接続を前提とし、
 * 接続できない環境では自己スキップせずテストを失敗させる（決定的に検知するため）。
 */

import { DynamoDBTodoRepository } from '../../src/repositories/todo/dynamodb-todo-repository.js';
import { InMemoryTodoRepository } from '../../src/repositories/todo/in-memory-todo-repository.js';
import { defineTodoRepositoryContract } from './todo.repository.contract.js';
import { createDynamoDbLocalTarget, createInMemoryTarget } from './helpers/raw-store.js';

const inMemory = createInMemoryTarget();
defineTodoRepositoryContract('InMemory', {
  ...inMemory.hooks,
  makeRepository: async () => new InMemoryTodoRepository(inMemory.getStore()),
});

const dynamoDbLocal = createDynamoDbLocalTarget('contract-todo');
defineTodoRepositoryContract('DynamoDB Local', {
  ...dynamoDbLocal.hooks,
  makeRepository: async () => {
    const { docClient, tableName } = await dynamoDbLocal.getTarget();
    return new DynamoDBTodoRepository(docClient, tableName);
  },
});
