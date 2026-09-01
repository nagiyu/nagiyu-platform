/**
 * Stock Tracker Core - InMemory Exchange Repository
 *
 * InMemorySingleTableStoreを使用したExchangeRepositoryの実装
 */

import {
  InMemorySingleTableStore,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  DatabaseError,
} from '@nagiyu/aws';
import type { ExchangeRepository } from './exchange.repository.interface.js';
import type {
  ExchangeEntity,
  CreateExchangeInput,
  UpdateExchangeInput,
} from '../entities/exchange.entity.js';
import { ExchangeMapper } from '../mappers/exchange.mapper.js';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  NO_UPDATES_SPECIFIED: '更新するフィールドが指定されていません',
} as const;

// store既定のqueryByAttribute limit（100件）で打ち切られると全取引所を取得できなくなるため、
// in-memory-ticker.repository.ts の getAllと同じ流儀でcursorループにより全件集約する
// （ページサイズ自体は任意）。
const FULL_SCAN_PAGE_SIZE = 100;

/**
 * InMemory Exchange Repository
 *
 * InMemorySingleTableStoreを使用した取引所リポジトリの実装
 * テスト環境で使用
 */
export class InMemoryExchangeRepository implements ExchangeRepository {
  private readonly mapper: ExchangeMapper;
  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.mapper = new ExchangeMapper();
  }

  /**
   * 取引所IDで単一の取引所を取得
   */
  public async getById(exchangeId: string): Promise<ExchangeEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ exchangeId });
    const item = this.store.get(pk, sk);

    if (!item) {
      return null;
    }

    return this.mapper.toEntity(item);
  }

  /**
   * 全取引所を取得
   *
   * `Type`属性の一致でScanを近似する（GSIを介さない）ため、返却順序は保証しない。
   * store既定のqueryByAttribute limit（100件）による打ち切りを避けるため、
   * cursorループで全件集約する（in-memory-ticker.repository.tsのgetAllと同じ流儀）。
   */
  public async getAll(): Promise<ExchangeEntity[]> {
    const items: ExchangeEntity[] = [];
    let cursor: string | undefined;

    do {
      const page = this.store.queryByAttribute(
        {
          attributeName: 'Type',
          attributeValue: 'Exchange',
        },
        {
          limit: FULL_SCAN_PAGE_SIZE,
          cursor,
        }
      );
      items.push(...page.items.map((item) => this.mapper.toEntity(item)));
      cursor = page.nextCursor;
    } while (cursor);

    return items;
  }

  /**
   * 新しい取引所を作成
   */
  public async create(input: CreateExchangeInput): Promise<ExchangeEntity> {
    const now = Date.now();
    const entity: ExchangeEntity = {
      ...input,
      CreatedAt: now,
      UpdatedAt: now,
    };

    const item = this.mapper.toItem(entity);

    try {
      this.store.put(item, { attributeNotExists: true });
      return entity;
    } catch (error) {
      // EntityAlreadyExistsError はそのまま投げる
      if (error instanceof EntityAlreadyExistsError) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * 取引所を更新
   */
  public async update(exchangeId: string, updates: UpdateExchangeInput): Promise<ExchangeEntity> {
    // 更新するフィールドがない場合はエラー
    if (Object.keys(updates).length === 0) {
      throw new DatabaseError(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
    }

    const { pk, sk } = this.mapper.buildKeys({ exchangeId });
    const existingItem = this.store.get(pk, sk);

    if (!existingItem) {
      throw new EntityNotFoundError('Exchange', exchangeId);
    }

    const existingEntity = this.mapper.toEntity(existingItem);
    const now = Date.now();

    // 更新を適用
    const updatedEntity: ExchangeEntity = {
      ...existingEntity,
      ...updates,
      UpdatedAt: now,
    };

    const updatedItem = this.mapper.toItem(updatedEntity);
    this.store.put(updatedItem);

    return updatedEntity;
  }

  /**
   * 取引所を削除
   */
  public async delete(exchangeId: string): Promise<void> {
    const { pk, sk } = this.mapper.buildKeys({ exchangeId });

    try {
      this.store.delete(pk, sk, { attributeExists: true });
    } catch (error) {
      // EntityNotFoundError はそのまま投げる
      if (error instanceof EntityNotFoundError) {
        throw error;
      }
      throw error;
    }
  }
}
