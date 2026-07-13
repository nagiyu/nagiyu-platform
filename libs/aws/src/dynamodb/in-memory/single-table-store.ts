import type { DynamoDBItem, PaginationOptions, PaginatedResult } from '../types.js';
import { EntityNotFoundError, EntityAlreadyExistsError } from '../errors.js';

/**
 * クエリ条件
 */
export interface QueryCondition {
  /** パーティションキー */
  pk: string;
  /** ソートキーの条件（オプション） */
  sk?: {
    /** 比較演算子 */
    operator: 'eq' | 'begins_with' | 'between' | 'gt' | 'gte' | 'lt' | 'lte';
    /** 値 */
    value: string | [string, string]; // between の場合は配列
  };
}

/**
 * 属性によるクエリ条件
 */
export interface AttributeQueryCondition {
  /** 属性名 */
  attributeName: string;
  /** 属性値 */
  attributeValue: string;
  /** ソートキー条件（オプション） */
  sk?: {
    /** ソートキー属性名 */
    attributeName: string;
    /** 比較演算子 */
    operator: 'eq' | 'begins_with' | 'between' | 'gt' | 'gte' | 'lt' | 'lte';
    /** 値 */
    value: string | [string, string];
  };
}

/**
 * InMemory Single Table Store
 *
 * DynamoDB の Single Table Design を再現するインメモリストア
 * テスト環境で使用する
 */
export class InMemorySingleTableStore {
  private store: Map<string, DynamoDBItem> = new Map();

  /**
   * アイテムを取得
   *
   * @param pk - パーティションキー
   * @param sk - ソートキー
   * @returns DynamoDB Item または undefined
   */
  get(pk: string, sk: string): DynamoDBItem | undefined {
    const key = this.buildKey(pk, sk);
    return this.store.get(key);
  }

  /**
   * アイテムを保存
   *
   * @param item - DynamoDB Item
   * @param condition - 条件（オプション）
   * @throws {EntityAlreadyExistsError} 条件付き保存で既存アイテムが存在する場合
   */
  put(item: DynamoDBItem, condition?: { attributeNotExists: boolean }): void {
    const key = this.buildKey(item.PK, item.SK);

    // 条件付き保存の処理
    if (condition?.attributeNotExists) {
      if (this.store.has(key)) {
        throw new EntityAlreadyExistsError(item.Type, `${item.PK}#${item.SK}`);
      }
    }

    this.store.set(key, item);
  }

  /**
   * アイテムを削除
   *
   * @param pk - パーティションキー
   * @param sk - ソートキー
   * @param condition - 条件（オプション）
   * @throws {EntityNotFoundError} 条件付き削除で既存アイテムが存在しない場合
   */
  delete(pk: string, sk: string, condition?: { attributeExists: boolean }): void {
    const key = this.buildKey(pk, sk);

    // 条件付き削除の処理
    if (condition?.attributeExists) {
      if (!this.store.has(key)) {
        throw new EntityNotFoundError('Item', `${pk}#${sk}`);
      }
    }

    this.store.delete(key);
  }

  /**
   * クエリ操作（PK/SK によるクエリ）
   *
   * @param condition - クエリ条件
   * @param options - ページネーションオプション
   * @returns ページネーション結果
   */
  query(condition: QueryCondition, options?: PaginationOptions): PaginatedResult<DynamoDBItem> {
    const { pk, sk } = condition;
    const limit = options?.limit || 100;

    // 全アイテムをフィルタリング
    let items = Array.from(this.store.values()).filter((item) => item.PK === pk);

    // SK条件でフィルタリング
    if (sk) {
      items = this.filterBySortKey(items, sk.operator, sk.value);
    }

    // 実DynamoDBのQueryはソートキー昇順で返すため、挿入順（Map反復順）に依存しないよう安定ソートする
    items = this.sortBySortKey(items, 'SK');

    // カーソルからの開始位置を特定
    let startIndex = 0;
    if (options?.cursor) {
      const cursorData = this.decodeCursor(options.cursor);
      startIndex = cursorData.index || 0;
    }

    // ページネーション
    const paginatedItems = items.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < items.length;
    const nextCursor = hasMore ? this.encodeCursor({ index: startIndex + limit }) : undefined;

    return {
      items: paginatedItems,
      nextCursor,
      count: items.length,
    };
  }

  /**
   * 属性によるクエリ操作（GSI をシミュレート）
   *
   * @param condition - クエリ条件
   * @param options - ページネーションオプション
   * @returns ページネーション結果
   */
  queryByAttribute(
    condition: AttributeQueryCondition,
    options?: PaginationOptions
  ): PaginatedResult<DynamoDBItem> {
    const { attributeName, attributeValue, sk } = condition;
    const limit = options?.limit || 100;

    // 全アイテムをフィルタリング
    let items = Array.from(this.store.values()).filter(
      (item) => item[attributeName] === attributeValue
    );

    // SK条件でフィルタリング
    if (sk) {
      items = this.filterBySortKey(items, sk.operator, sk.value, sk.attributeName);
    }

    // 実DynamoDBのGSI Queryはソートキー（GSIのSK属性）昇順で返すため、挿入順に依存しないよう安定ソートする
    items = this.sortBySortKey(items, sk?.attributeName ?? 'SK');

    // カーソルからの開始位置を特定
    let startIndex = 0;
    if (options?.cursor) {
      const cursorData = this.decodeCursor(options.cursor);
      startIndex = cursorData.index || 0;
    }

    // ページネーション
    const paginatedItems = items.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < items.length;
    const nextCursor = hasMore ? this.encodeCursor({ index: startIndex + limit }) : undefined;

    return {
      items: paginatedItems,
      nextCursor,
      count: items.length,
    };
  }

  /**
   * スキャン操作（全件取得）
   *
   * @param options - ページネーションオプション
   * @returns ページネーション結果
   */
  scan(options?: PaginationOptions): PaginatedResult<DynamoDBItem> {
    const limit = options?.limit || 100;
    const items = Array.from(this.store.values());

    // カーソルからの開始位置を特定
    let startIndex = 0;
    if (options?.cursor) {
      const cursorData = this.decodeCursor(options.cursor);
      startIndex = cursorData.index || 0;
    }

    // ページネーション
    const paginatedItems = items.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < items.length;
    const nextCursor = hasMore ? this.encodeCursor({ index: startIndex + limit }) : undefined;

    return {
      items: paginatedItems,
      nextCursor,
      count: items.length,
    };
  }

  /**
   * ストアをクリア（テスト用）
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * ストア内のアイテム数を取得（テスト用）
   */
  size(): number {
    return this.store.size;
  }

  /**
   * PK/SK からキーを構築
   */
  private buildKey(pk: string, sk: string): string {
    return `${pk}#${sk}`;
  }

  /**
   * ソートキー条件でフィルタリング
   */
  private filterBySortKey(
    items: DynamoDBItem[],
    operator: string,
    value: string | [string, string],
    skAttribute: string = 'SK'
  ): DynamoDBItem[] {
    return items.filter((item) => {
      const sk = item[skAttribute] as string;

      switch (operator) {
        case 'eq':
          return sk === value;
        case 'begins_with':
          return sk.startsWith(value as string);
        case 'between':
          if (Array.isArray(value)) {
            return sk >= value[0] && sk <= value[1];
          }
          return false;
        case 'gt':
          return sk > (value as string);
        case 'gte':
          return sk >= (value as string);
        case 'lt':
          return sk < (value as string);
        case 'lte':
          return sk <= (value as string);
        default:
          return false;
      }
    });
  }

  /**
   * ソートキー属性で昇順（文字列の辞書順）に安定ソートする
   *
   * 実DynamoDBのQuery（GSI経由を含む）はソートキー昇順で結果を返すため、
   * InMemory実装もこれに合わせて挿入順（Map反復順）ではなくソートキー順で返す。
   *
   * 近似の範囲: String型ソートキーの辞書順（JSの文字列比較＝UTF-16コードユニット順）で
   * 近似する。現行のキー体系（ASCII範囲のPK/SK・GSIキー）では実DynamoDBのUTF-8バイト順と
   * 一致する。BMP外文字（サロゲートペア）やNumber型ソートキーは対象外（本ストアは文字列前提）。
   *
   * @param items - ソート対象アイテム
   * @param skAttribute - ソートキーとして扱う属性名（Queryは'SK'、GSI経由はGSIのSK属性名）
   */
  private sortBySortKey(items: DynamoDBItem[], skAttribute: string): DynamoDBItem[] {
    return [...items].sort((a, b) => {
      const aKey = String(a[skAttribute] ?? '');
      const bKey = String(b[skAttribute] ?? '');
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    });
  }

  /**
   * カーソルをエンコード（不透明トークン）
   */
  private encodeCursor(data: { index: number }): string {
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  /**
   * カーソルをデコード
   */
  private decodeCursor(cursor: string): { index: number } {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch {
      return { index: 0 };
    }
  }
}
