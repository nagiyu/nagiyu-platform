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
import type { EntityMapper } from '../mapper/entity-mapper.interface.js';
import type {
  EntityStore,
  EntityUpdateAttributes,
  EntityWriteOptions,
} from './entity-store.interface.js';
import {
  ENTITY_STORE_ERROR_MESSAGES,
  UPDATED_AT_ATTRIBUTE,
  buildUpdateFields,
  convertToEntity,
  describeKey,
  getPartitionKeyName,
} from './entity-store-support.js';

/** DynamoDBEntityStore のオプション */
export interface DynamoDBEntityStoreOptions {
  /** 現在時刻 (ミリ秒) の供給元。update の UpdatedAt に使う。テストで差し替える */
  now?: () => number;
}

/**
 * DynamoDB 上の EntityStore 実装。
 *
 * `create` / `put` は `toItem` の結果をそのまま書く。タイムスタンプは Entity 側で
 * 呼び出し側が決める前提で、store は上書きしない。`update` だけは `UpdatedAt` を管理する。
 */
export class DynamoDBEntityStore<TEntity, TKey> implements EntityStore<TEntity, TKey> {
  private readonly now: () => number;

  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly mapper: EntityMapper<TEntity, TKey>,
    options: DynamoDBEntityStoreOptions = {}
  ) {
    this.now = options.now ?? Date.now;
  }

  async get(key: TKey): Promise<TEntity | null> {
    try {
      const result = await this.docClient.send(
        new GetCommand({ TableName: this.tableName, Key: this.mapper.buildKeys(key) })
      );
      if (!result.Item) {
        return null;
      }
      return convertToEntity(this.mapper, result.Item);
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  async create(entity: TEntity): Promise<TEntity> {
    const keys = this.mapper.buildKeys(this.mapper.getKey(entity));
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.mapper.toItem(entity),
          ConditionExpression: 'attribute_not_exists(#pk)',
          ExpressionAttributeNames: { '#pk': getPartitionKeyName(keys) },
        })
      );
      return entity;
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        throw new EntityAlreadyExistsError(this.mapper.entityType, describeKey(keys));
      }
      throw toDatabaseError(error);
    }
  }

  async put(entity: TEntity, options: EntityWriteOptions = {}): Promise<TEntity> {
    const keys = this.mapper.buildKeys(this.mapper.getKey(entity));
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.mapper.toItem(entity),
          ...this.buildLockCondition(getPartitionKeyName(keys), options.expectedUpdatedAt, false),
        })
      );
      return entity;
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        throw new OptimisticLockError(this.mapper.entityType, describeKey(keys));
      }
      throw toDatabaseError(error);
    }
  }

  async update(
    key: TKey,
    attributes: EntityUpdateAttributes,
    options: EntityWriteOptions = {}
  ): Promise<TEntity> {
    const keys = this.mapper.buildKeys(key);
    const parts = buildUpdateExpression(buildUpdateFields(this.mapper, attributes), {
      timestamp: { attributeName: UPDATED_AT_ATTRIBUTE, value: this.now() },
      updateTimestampWhenEmpty: true,
    });
    if (!parts) {
      // timestamp を渡しているため到達しない。型の絞り込みのために明示する
      throw new InvalidEntityDataError(ENTITY_STORE_ERROR_MESSAGES.UPDATE_RESULT_MISSING);
    }

    const lock = this.buildLockCondition(
      getPartitionKeyName(keys),
      options.expectedUpdatedAt,
      true
    );
    try {
      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: keys,
          UpdateExpression: parts.UpdateExpression,
          ConditionExpression: lock.ConditionExpression,
          ExpressionAttributeNames: {
            ...parts.ExpressionAttributeNames,
            ...lock.ExpressionAttributeNames,
          },
          ExpressionAttributeValues:
            parts.ExpressionAttributeValues || lock.ExpressionAttributeValues
              ? { ...parts.ExpressionAttributeValues, ...lock.ExpressionAttributeValues }
              : undefined,
          ReturnValues: 'ALL_NEW',
        })
      );
      if (!result.Attributes) {
        throw new InvalidEntityDataError(ENTITY_STORE_ERROR_MESSAGES.UPDATE_RESULT_MISSING);
      }
      return convertToEntity(this.mapper, result.Attributes);
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        // expectedUpdatedAt があるときは不在と不一致を区別できないため、不一致側に寄せる
        if (options.expectedUpdatedAt !== undefined) {
          throw new OptimisticLockError(this.mapper.entityType, describeKey(keys));
        }
        throw new EntityNotFoundError(this.mapper.entityType, describeKey(keys));
      }
      throw toDatabaseError(error);
    }
  }

  async delete(key: TKey): Promise<void> {
    const keys = this.mapper.buildKeys(key);
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

  async deleteIfExists(key: TKey): Promise<void> {
    try {
      await this.docClient.send(
        new DeleteCommand({ TableName: this.tableName, Key: this.mapper.buildKeys(key) })
      );
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * 書き込みの条件式を組み立てる。
   *
   * @param requireExists - 楽観ロックなしでも「存在すること」を条件にするか (update 用)。
   *   put は条件なし (upsert) にするため false。
   */
  private buildLockCondition(
    partitionKeyName: string,
    expectedUpdatedAt: number | undefined,
    requireExists: boolean
  ): {
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  } {
    if (expectedUpdatedAt !== undefined) {
      return {
        ConditionExpression: 'attribute_exists(#pk) AND #updatedAt = :expectedUpdatedAt',
        ExpressionAttributeNames: { '#pk': partitionKeyName, '#updatedAt': UPDATED_AT_ATTRIBUTE },
        ExpressionAttributeValues: { ':expectedUpdatedAt': expectedUpdatedAt },
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
}
