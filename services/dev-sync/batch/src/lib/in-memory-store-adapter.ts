/**
 * InMemorySingleTableStore を DynamoTableStore インターフェースに適合させるアダプター
 *
 * テスト用途専用。本番コードでは DynamoDocumentClientStoreAdapter を使う。
 */

import type { DynamoDBItem } from '@nagiyu/aws';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import type { DynamoTableStore, ScanPage, QueryPage } from './store-adapter.js';

/**
 * InMemorySingleTableStore ラッパー
 *
 * テストで 2 つのストア（prod/dev）を独立して扱えるよう、
 * InMemorySingleTableStore をラップして DynamoTableStore として使う。
 */
export class InMemoryStoreAdapter implements DynamoTableStore {
  constructor(private readonly store: InMemorySingleTableStore) {}

  async scan(options: {
    pkPrefix?: string;
    skPrefix?: string;
    exclusiveStartKey?: string;
  }): Promise<ScanPage> {
    const { pkPrefix, skPrefix, exclusiveStartKey } = options;

    // ページネーション: cursor から offset を復元
    const startIndex = exclusiveStartKey
      ? this.decodeCursor(exclusiveStartKey)
      : 0;

    // 全件取得してフィルタ
    const scanResult = this.store.scan({ limit: 10_000 });
    let items = scanResult.items;

    // PK プレフィックスでフィルタ
    if (pkPrefix) {
      items = items.filter((item) => (item.PK as string).startsWith(pkPrefix));
    }
    // SK プレフィックスでフィルタ
    if (skPrefix) {
      items = items.filter((item) => (item.SK as string).startsWith(skPrefix));
    }

    // ページネーション（1 ページあたり最大 100 件）
    const pageSize = 100;
    const page = items.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < items.length;
    const lastEvaluatedKey = hasMore
      ? this.encodeCursor(startIndex + pageSize)
      : undefined;

    return { items: page, lastEvaluatedKey };
  }

  async queryGsi(options: {
    indexName: string;
    pkAttributeName: string;
    pkValue: string;
    skAttributeName: string;
    skFrom: string;
    exclusiveStartKey?: string;
  }): Promise<QueryPage> {
    const { pkAttributeName, pkValue, skAttributeName, skFrom, exclusiveStartKey } = options;

    const startIndex = exclusiveStartKey
      ? this.decodeCursor(exclusiveStartKey)
      : 0;

    // GSI シミュレーション: 指定属性でフィルタ
    const scanResult = this.store.scan({ limit: 10_000 });
    let items = scanResult.items.filter(
      (item) => item[pkAttributeName] === pkValue
    );

    // SK 下限でフィルタ（ >= skFrom）
    items = items.filter(
      (item) => typeof item[skAttributeName] === 'string' &&
        (item[skAttributeName] as string) >= skFrom
    );

    // ページネーション
    const pageSize = 100;
    const page = items.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < items.length;
    const lastEvaluatedKey = hasMore
      ? this.encodeCursor(startIndex + pageSize)
      : undefined;

    return { items: page, lastEvaluatedKey };
  }

  async put(item: DynamoDBItem): Promise<void> {
    this.store.put(item);
  }

  async delete(pk: string, sk: string): Promise<void> {
    this.store.delete(pk, sk);
  }

  private encodeCursor(index: number): string {
    return Buffer.from(JSON.stringify({ index })).toString('base64');
  }

  private decodeCursor(cursor: string): number {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as {
        index: number;
      };
      return decoded.index;
    } catch {
      return 0;
    }
  }
}
