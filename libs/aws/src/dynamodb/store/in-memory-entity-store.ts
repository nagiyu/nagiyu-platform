import { EntityAlreadyExistsError, EntityNotFoundError, OptimisticLockError } from '../errors.js';
import { REMOVE_ATTRIBUTE } from '../helpers.js';
import type { InMemorySingleTableStore } from '../in-memory/single-table-store.js';
import type { EntityMapper } from '../mapper/entity-mapper.interface.js';
import type {
  EntityStore,
  EntityUpdateAttributes,
  EntityWriteOptions,
} from './entity-store.interface.js';
import {
  UPDATED_AT_ATTRIBUTE,
  buildUpdateFields,
  convertToEntity,
  describeKey,
} from './entity-store-support.js';

/** InMemoryEntityStore のオプション */
export interface InMemoryEntityStoreOptions {
  /** 現在時刻 (ミリ秒) の供給元。update の UpdatedAt に使う */
  now?: () => number;
}

/**
 * `InMemorySingleTableStore` 上の EntityStore 実装。
 * DynamoDBEntityStore と同じ操作で同じエラーを投げ、テストでサービス層をそのまま動かせるようにする。
 */
export class InMemoryEntityStore<TEntity, TKey> implements EntityStore<TEntity, TKey> {
  private readonly now: () => number;

  constructor(
    private readonly store: InMemorySingleTableStore,
    private readonly mapper: EntityMapper<TEntity, TKey>,
    options: InMemoryEntityStoreOptions = {}
  ) {
    this.now = options.now ?? Date.now;
  }

  async get(key: TKey): Promise<TEntity | null> {
    const item = this.store.getByKey(this.mapper.buildKeys(key));
    return item ? convertToEntity(this.mapper, item) : null;
  }

  async create(entity: TEntity): Promise<TEntity> {
    const keys = this.mapper.buildKeys(this.mapper.getKey(entity));
    if (this.store.getByKey(keys)) {
      throw new EntityAlreadyExistsError(this.mapper.entityType, describeKey(keys));
    }
    this.store.putByKey(keys, this.mapper.toItem(entity));
    return entity;
  }

  async put(entity: TEntity, options: EntityWriteOptions = {}): Promise<TEntity> {
    const keys = this.mapper.buildKeys(this.mapper.getKey(entity));
    if (options.expectedUpdatedAt !== undefined) {
      const existing = this.store.getByKey(keys);
      if (!existing || existing[UPDATED_AT_ATTRIBUTE] !== options.expectedUpdatedAt) {
        throw new OptimisticLockError(this.mapper.entityType, describeKey(keys));
      }
    }
    this.store.putByKey(keys, this.mapper.toItem(entity));
    return entity;
  }

  async update(
    key: TKey,
    attributes: EntityUpdateAttributes,
    options: EntityWriteOptions = {}
  ): Promise<TEntity> {
    const keys = this.mapper.buildKeys(key);
    const existing = this.store.getByKey(keys);
    if (options.expectedUpdatedAt !== undefined) {
      // DynamoDB 版と同じく、不在と不一致を区別せず楽観ロック失敗として扱う
      if (!existing || existing[UPDATED_AT_ATTRIBUTE] !== options.expectedUpdatedAt) {
        throw new OptimisticLockError(this.mapper.entityType, describeKey(keys));
      }
    } else if (!existing) {
      throw new EntityNotFoundError(this.mapper.entityType, describeKey(keys));
    }

    const updated: Record<string, unknown> = { ...existing };
    for (const [name, value] of Object.entries(buildUpdateFields(this.mapper, attributes))) {
      if (value === REMOVE_ATTRIBUTE) {
        delete updated[name];
      } else {
        updated[name] = value;
      }
    }
    updated[UPDATED_AT_ATTRIBUTE] = this.now();

    this.store.putByKey(keys, updated);
    return convertToEntity(this.mapper, updated);
  }

  async delete(key: TKey): Promise<void> {
    const keys = this.mapper.buildKeys(key);
    if (!this.store.getByKey(keys)) {
      throw new EntityNotFoundError(this.mapper.entityType, describeKey(keys));
    }
    this.store.deleteByKey(keys);
  }

  async deleteIfExists(key: TKey): Promise<void> {
    this.store.deleteByKey(this.mapper.buildKeys(key));
  }
}
