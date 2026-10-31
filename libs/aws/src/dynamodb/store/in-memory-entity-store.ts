import { EntityNotFoundError, OptimisticLockError } from '../errors.js';
import { REMOVE_ATTRIBUTE } from '../helpers.js';
import type { InMemorySingleTableStore } from '../in-memory/single-table-store.js';
import type {
  DynamoDBAttributes,
  DynamoDBKey,
  EntityMapper,
  EntityPatch,
} from '../mapper/entity-mapper.interface.js';
import type {
  CreateIfAbsentResult,
  EntityCreateInput,
  EntityCreateOptions,
  EntityPutInput,
  EntityStore,
  EntityWriteOptions,
  UpdateIfAttributeAbsentResult,
} from './entity-store.interface.js';
import {
  UPDATED_AT_ATTRIBUTE,
  convertToEntity,
  createConflictError,
  createOrReadExisting,
  describeKey,
  planUpdate,
  prepareWriteItem,
  resolveKeys,
} from './entity-store-support.js';

/** InMemoryEntityStore のオプション */
export interface InMemoryEntityStoreOptions {
  /** 現在時刻 (ミリ秒) の供給元。UpdatedAt と、省略された createdAt の値に使う */
  now?: () => number;
}

/**
 * `InMemorySingleTableStore` 上の EntityStore 実装。
 * DynamoDBEntityStore と同じ操作で同じエラーを投げ、テストでサービス層をそのまま動かせるようにする。
 */
export class InMemoryEntityStore<TEntity, TKey> implements EntityStore<TEntity, TKey> {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper: EntityMapper<TEntity, TKey>;
  private readonly now: () => number;

  constructor(
    store: InMemorySingleTableStore,
    mapper: EntityMapper<TEntity, TKey>,
    options: InMemoryEntityStoreOptions = {}
  ) {
    this.store = store;
    this.mapper = mapper;
    this.now = options.now ?? Date.now;
  }

  // InMemory は常に最新を読むため、consistentRead を受ける引数自体を持たない
  public async get(key: TKey): Promise<TEntity | null> {
    const item = this.store.getByKey(resolveKeys(this.mapper, key));
    return item ? convertToEntity(this.mapper, item) : null;
  }

  public async create(
    input: EntityCreateInput<TEntity>,
    options: EntityCreateOptions = {}
  ): Promise<TEntity> {
    const { keys, item } = prepareWriteItem(this.mapper, input, this.now());
    return this.insertIfAbsent(keys, item, options);
  }

  public async createIfAbsent(
    input: EntityCreateInput<TEntity>
  ): Promise<CreateIfAbsentResult<TEntity>> {
    const { keys, item } = prepareWriteItem(this.mapper, input, this.now());
    return createOrReadExisting(
      async () => this.insertIfAbsent(keys, item, {}),
      async () => {
        const existing = this.store.getByKey(keys);
        return existing ? convertToEntity(this.mapper, existing) : null;
      }
    );
  }

  public async put(
    input: EntityPutInput<TEntity>,
    options: EntityWriteOptions = {}
  ): Promise<TEntity> {
    const { keys, item } = prepareWriteItem(this.mapper, input, this.now());
    this.assertLock(keys, options);
    this.store.putByKey(keys, item);
    return convertToEntity(this.mapper, item);
  }

  public async update(
    key: TKey,
    changes: EntityPatch<TEntity>,
    options: EntityWriteOptions = {}
  ): Promise<TEntity> {
    const { keys, fields } = planUpdate(this.mapper, key, changes);
    const existing = this.assertLock(keys, options, true) as DynamoDBAttributes;
    return this.applyUpdate(keys, existing, fields);
  }

  public async updateIfAttributeAbsent(
    key: TKey,
    attributeName: string,
    changes: EntityPatch<TEntity>
  ): Promise<UpdateIfAttributeAbsentResult<TEntity>> {
    const { keys, fields } = planUpdate(this.mapper, key, changes);
    // DynamoDB の条件式は保存 Item の属性の有無を見る。Entity に変換した後のフィールドでは、
    // mapper が読まない属性や変換で値が変わる属性を取り違えるため、変換前の保存 Item で判定する
    const existing = this.store.getByKey(keys);
    if (!existing) {
      throw new EntityNotFoundError(this.mapper.entityType, describeKey(keys));
    }
    if (existing[attributeName] !== undefined) {
      return { entity: convertToEntity(this.mapper, existing), updated: false };
    }
    return { entity: this.applyUpdate(keys, existing, fields), updated: true };
  }

  public async delete(key: TKey): Promise<void> {
    const keys = resolveKeys(this.mapper, key);
    if (!this.store.getByKey(keys)) {
      throw new EntityNotFoundError(this.mapper.entityType, describeKey(keys));
    }
    this.store.deleteByKey(keys);
  }

  public async deleteIfExists(key: TKey): Promise<void> {
    this.store.deleteByKey(resolveKeys(this.mapper, key));
  }

  /** 無いときだけ書く。既にあれば `options` に応じたエラーを投げる */
  private insertIfAbsent(
    keys: DynamoDBKey,
    item: DynamoDBAttributes,
    options: EntityCreateOptions
  ): TEntity {
    if (this.store.getByKey(keys)) {
      throw createConflictError(this.mapper.entityType, keys, options);
    }
    this.store.putByKey(keys, item);
    return convertToEntity(this.mapper, item);
  }

  /** 既存 Item に更新内容と UpdatedAt を反映して保存し、Entity にして返す */
  private applyUpdate(
    keys: DynamoDBKey,
    existing: DynamoDBAttributes,
    fields: Record<string, unknown>
  ): TEntity {
    const updated: DynamoDBAttributes = { ...existing };
    for (const [name, value] of Object.entries(fields)) {
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

  /**
   * 書き込み前の条件を検証し、既存の Item を返す。
   * DynamoDB 版と同じく、楽観ロック指定時は不在を EntityNotFoundError、不一致を OptimisticLockError にし、
   * 指定なしの put は条件なし、update は存在だけを条件にする。
   */
  private assertLock(
    keys: DynamoDBKey,
    options: EntityWriteOptions,
    requireExists = false
  ): DynamoDBAttributes | undefined {
    const existing = this.store.getByKey(keys);
    if (options.expectedUpdatedAt !== undefined) {
      if (!existing) {
        throw new EntityNotFoundError(this.mapper.entityType, describeKey(keys));
      }
      if (existing[UPDATED_AT_ATTRIBUTE] !== options.expectedUpdatedAt) {
        throw new OptimisticLockError(this.mapper.entityType, describeKey(keys));
      }
    } else if (requireExists && !existing) {
      throw new EntityNotFoundError(this.mapper.entityType, describeKey(keys));
    }
    return existing;
  }
}
