import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidEntityDataError,
  OptimisticLockError,
  isConditionalCheckFailed,
  toDatabaseError,
} from '../errors.js';
import { buildUpdateExpression } from '../helpers.js';
import type { DynamoDBKey, EntityMapper, EntityPatch } from '../mapper/entity-mapper.interface.js';
import type {
  EntityCreateInput,
  EntityPutInput,
  EntityReadOptions,
  EntityStore,
  EntityWriteOptions,
} from './entity-store.interface.js';
import {
  ENTITY_STORE_ERROR_MESSAGES,
  UPDATED_AT_ATTRIBUTE,
  convertToEntity,
  describeKey,
  getPartitionKeyName,
  planUpdate,
  prepareWriteItem,
  resolveKeys,
} from './entity-store-support.js';

/** DynamoDBEntityStore のオプション */
export interface DynamoDBEntityStoreOptions {
  /** 現在時刻 (ミリ秒) の供給元。UpdatedAt と、省略された createdAt の値に使う。テストで差し替える */
  now?: () => number;
}

/**
 * DynamoDB 上の EntityStore 実装。
 *
 * `UpdatedAt` は create / put / update のすべてで store が `now()` で設定する。
 * create / put は `now()` を 1 回だけ読み、省略された `createdAt` にも同じ値を使う。
 * 指定された `createdAt` とその他のタイムスタンプは `toItem` の結果のまま書く。
 */
export class DynamoDBEntityStore<TEntity, TKey> implements EntityStore<TEntity, TKey> {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper: EntityMapper<TEntity, TKey>;
  private readonly now: () => number;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    mapper: EntityMapper<TEntity, TKey>,
    options: DynamoDBEntityStoreOptions = {}
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = mapper;
    this.now = options.now ?? Date.now;
  }

  public async get(key: TKey, options: EntityReadOptions = {}): Promise<TEntity | null> {
    const keys = resolveKeys(this.mapper, key);
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: keys,
          ConsistentRead: options.consistentRead,
        })
      );
      if (!result.Item) {
        return null;
      }
      return convertToEntity(this.mapper, result.Item);
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  public async create(input: EntityCreateInput<TEntity>): Promise<TEntity> {
    const { keys, item } = prepareWriteItem(this.mapper, input, this.now());
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(#pk)',
          ExpressionAttributeNames: { '#pk': getPartitionKeyName(keys) },
        })
      );
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        throw new EntityAlreadyExistsError(this.mapper.entityType, describeKey(keys));
      }
      throw toDatabaseError(error);
    }
    return convertToEntity(this.mapper, item);
  }

  public async put(
    input: EntityPutInput<TEntity>,
    options: EntityWriteOptions = {}
  ): Promise<TEntity> {
    const { keys, item } = prepareWriteItem(this.mapper, input, this.now());
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ...this.buildCondition(getPartitionKeyName(keys), options.expectedUpdatedAt, false),
        })
      );
    } catch (error) {
      throw this.mapLockFailure(error, keys);
    }
    return convertToEntity(this.mapper, item);
  }

  public async update(
    key: TKey,
    changes: EntityPatch<TEntity>,
    options: EntityWriteOptions = {}
  ): Promise<TEntity> {
    const { keys, fields } = planUpdate(this.mapper, key, changes);
    const parts = buildUpdateExpression(fields, {
      timestamp: { attributeName: UPDATED_AT_ATTRIBUTE, value: this.now() },
      updateTimestampWhenEmpty: true,
    });
    if (!parts) {
      // timestamp を渡しているため到達しない。型の絞り込みのために明示する
      throw new InvalidEntityDataError(ENTITY_STORE_ERROR_MESSAGES.UPDATE_RESULT_MISSING);
    }

    const condition = this.buildCondition(
      getPartitionKeyName(keys),
      options.expectedUpdatedAt,
      true
    );
    const values = { ...parts.ExpressionAttributeValues, ...condition.ExpressionAttributeValues };
    try {
      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: keys,
          UpdateExpression: parts.UpdateExpression,
          ConditionExpression: condition.ConditionExpression,
          ExpressionAttributeNames: {
            ...parts.ExpressionAttributeNames,
            ...condition.ExpressionAttributeNames,
          },
          ExpressionAttributeValues: Object.keys(values).length > 0 ? values : undefined,
          ReturnValues: 'ALL_NEW',
          ReturnValuesOnConditionCheckFailure: condition.ReturnValuesOnConditionCheckFailure,
        })
      );
      if (!result.Attributes) {
        throw new InvalidEntityDataError(ENTITY_STORE_ERROR_MESSAGES.UPDATE_RESULT_MISSING);
      }
      return convertToEntity(this.mapper, result.Attributes);
    } catch (error) {
      throw this.mapLockFailure(error, keys);
    }
  }

  public async delete(key: TKey): Promise<void> {
    const keys = resolveKeys(this.mapper, key);
    try {
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: keys,
          ConditionExpression: 'attribute_exists(#pk)',
          ExpressionAttributeNames: { '#pk': getPartitionKeyName(keys) },
        })
      );
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        throw new EntityNotFoundError(this.mapper.entityType, describeKey(keys));
      }
      throw toDatabaseError(error);
    }
  }

  public async deleteIfExists(key: TKey): Promise<void> {
    const keys = resolveKeys(this.mapper, key);
    try {
      await this.docClient.send(new DeleteCommand({ TableName: this.tableName, Key: keys }));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * put / update の条件式を組み立てる。
   *
   * @param requireExists - 楽観ロックなしでも「存在すること」を条件にするか (update 用)。
   *   put は条件なし (upsert) にするため false。
   *
   * 楽観ロックありのときだけ `ALL_OLD` を要求する。条件失敗の例外に旧 Item が付くかどうかで、
   * 不在 (付かない) と UpdatedAt の不一致 (付く) を見分けるため。
   */
  private buildCondition(
    partitionKeyName: string,
    expectedUpdatedAt: number | undefined,
    requireExists: boolean
  ): {
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
    ReturnValuesOnConditionCheckFailure?: 'ALL_OLD';
  } {
    if (expectedUpdatedAt !== undefined) {
      return {
        ConditionExpression: 'attribute_exists(#pk) AND #updatedAt = :expectedUpdatedAt',
        ExpressionAttributeNames: { '#pk': partitionKeyName, '#updatedAt': UPDATED_AT_ATTRIBUTE },
        ExpressionAttributeValues: { ':expectedUpdatedAt': expectedUpdatedAt },
        ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
      };
    }
    if (requireExists) {
      return {
        ConditionExpression: 'attribute_exists(#pk)',
        ExpressionAttributeNames: { '#pk': partitionKeyName },
      };
    }
    return {};
  }

  /**
   * put / update の失敗を Entity 例外に変換する。
   *
   * 条件失敗の例外の `Item` は SDK が unmarshall しない生の AttributeValue 形式だが、
   * ここでは旧 Item があるかどうかだけを見るため中身は読まない。
   */
  private mapLockFailure(error: unknown, keys: DynamoDBKey): Error {
    if (isConditionalCheckFailed(error)) {
      const oldItem = (error as { Item?: Record<string, unknown> }).Item;
      const identifier = describeKey(keys);
      if (oldItem && Object.keys(oldItem).length > 0) {
        return new OptimisticLockError(this.mapper.entityType, identifier);
      }
      return new EntityNotFoundError(this.mapper.entityType, identifier);
    }
    return toDatabaseError(error);
  }
}
