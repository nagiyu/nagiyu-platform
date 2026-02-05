/**
 * Repository Factory
 *
 * 環境変数に基づいてDynamoDBまたはInMemoryリポジトリを生成するファクトリ
 * E2Eテスト時はインメモリリポジトリを使用することで、DynamoDBへの依存を排除
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  IAlertRepository,
  ITickerRepository,
  IHoldingRepository,
} from '@nagiyu/stock-tracker-core';
import {
  DynamoDBAlertRepository,
  DynamoDBTickerRepository,
  DynamoDBHoldingRepository,
  InMemoryAlertRepository,
  InMemoryTickerRepository,
  InMemoryHoldingRepository,
} from '@nagiyu/stock-tracker-core';

// シングルトンのインメモリストア
let inMemoryStore: InMemorySingleTableStore | null = null;

/**
 * インメモリストアを取得（シングルトンパターン）
 */
function getInMemoryStore(): InMemorySingleTableStore {
  if (!inMemoryStore) {
    inMemoryStore = new InMemorySingleTableStore();
  }
  return inMemoryStore;
}

/**
 * 環境変数に基づいてリポジトリタイプを判定
 *
 * @returns 'memory' または 'dynamodb'
 */
function getRepositoryType(): 'memory' | 'dynamodb' {
  const useMemory = process.env.USE_MEMORY_REPOSITORY === 'true';
  return useMemory ? 'memory' : 'dynamodb';
}

/**
 * Alert Repository を生成
 *
 * @param docClient - DynamoDB Document Client（DynamoDB使用時のみ）
 * @param tableName - DynamoDB テーブル名（DynamoDB使用時のみ）
 * @returns Alert Repository インスタンス
 */
export function createAlertRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): IAlertRepository {
  const type = getRepositoryType();

  if (type === 'memory') {
    const store = getInMemoryStore();
    return new InMemoryAlertRepository(store);
  }

  // DynamoDB の場合
  if (!docClient || !tableName) {
    throw new Error('DynamoDB client and table name are required for DynamoDB repository');
  }
  return new DynamoDBAlertRepository(docClient, tableName);
}

/**
 * Ticker Repository を生成
 *
 * @param docClient - DynamoDB Document Client（DynamoDB使用時のみ）
 * @param tableName - DynamoDB テーブル名（DynamoDB使用時のみ）
 * @returns Ticker Repository インスタンス
 */
export function createTickerRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ITickerRepository {
  const type = getRepositoryType();

  if (type === 'memory') {
    const store = getInMemoryStore();
    return new InMemoryTickerRepository(store);
  }

  // DynamoDB の場合
  if (!docClient || !tableName) {
    throw new Error('DynamoDB client and table name are required for DynamoDB repository');
  }
  return new DynamoDBTickerRepository(docClient, tableName);
}

/**
 * Holding Repository を生成
 *
 * @param docClient - DynamoDB Document Client（DynamoDB使用時のみ）
 * @param tableName - DynamoDB テーブル名（DynamoDB使用時のみ）
 * @returns Holding Repository インスタンス
 */
export function createHoldingRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): IHoldingRepository {
  const type = getRepositoryType();

  if (type === 'memory') {
    const store = getInMemoryStore();
    return new InMemoryHoldingRepository(store);
  }

  // DynamoDB の場合
  if (!docClient || !tableName) {
    throw new Error('DynamoDB client and table name are required for DynamoDB repository');
  }
  return new DynamoDBHoldingRepository(docClient, tableName);
}

/**
 * インメモリストアをクリア（テスト後のクリーンアップ用）
 */
export function clearInMemoryStore(): void {
  if (inMemoryStore) {
    inMemoryStore = new InMemorySingleTableStore();
  }
}
