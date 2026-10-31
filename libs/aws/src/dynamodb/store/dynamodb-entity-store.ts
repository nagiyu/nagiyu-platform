import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  EntityNotFoundError,
  InvalidEntityDataError,
  OptimisticLockError,
  isConditionalCheckFailed,
  toDatabaseError,
} from '../errors.js';
import { buildUpdateExpression } from '../helpers.js';
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
  EntityReadOptions,
  EntityStore,
  EntityWriteOptions,
  UpdateIfAttributeAbsentResult,
} from './entity-store.interface.js';
import {
  ENTITY_STORE_ERROR_MESSAGES,
  UPDATED_AT_ATTRIBUTE,
  convertToEntity,
  createConflictError,
  createOrReadExisting,
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

/** update 系の条件式とそのプレースホルダ */
interface UpdateCondition {
  ConditionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
  ReturnValuesOnConditionCheckFailure?: 'ALL_OLD';
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
    return this.getByKeys(resolveKeys(this.mapper, key), options.consistentRead);
  }

  public async create(
    input: EntityCreateInput<TEntity>,
    options: EntityCreateOptions = {}
  ): Promise<TEntity> {
    const { keys, item } = prepareWriteItem(this.mapper, input, this.now());
    await this.putIfAbsent(keys, item, options);
    return convertToEntity(this.mapper, item);
  }

  public async createIfAbsent(
    input: EntityCreateInput<TEntity>
  ): Promise<CreateIfAbsentResult<TEntity>> {
    const { keys, item } = prepareWriteItem(this.mapper, input, this.now());
    return createOrReadExisting(
      async () => {
        await this.putIfAbsent(keys, item, {});
        return convertToEntity(this.mapper, item);
      },
      // 衝突相手の書き込み直後でも見えるよう、強い整合性で読む
      () => this.getByKeys(keys, true)
    );
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
    const condition = this.buildCondition(
      getPartitionKeyName(keys),
      options.expectedUpdatedAt,
      true
    );
    try {
      return await this.sendUpdate(keys, fields, condition);
    } catch (error) {
      throw this.mapLockFailure(error, keys);
    }
  }

  public async updateIfAttributeAbsent(
    key: TKey,
    attributeName: string,
    changes: EntityPatch<TEntity>
  ): Promise<UpdateIfAttributeAbsentResult<TEntity>> {
    const { keys, fields } = planUpdate(this.mapper, key, changes);
    try {
      const entity = await this.sendUpdate(keys, fields, {
        ConditionExpression: 'attribute_exists(#pk) AND attribute_not_exists(#absentAttribute)',
        ExpressionAttributeNames: {
          '#pk': getPartitionKeyName(keys),
          '#absentAttribute': attributeName,
        },
        ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
      });
      return { entity, updated: true };
    } catch (error) {
      if (!isConditionalCheckFailed(error)) {
        throw toDatabaseError(error);
      }
      // 旧 Item が付かなければ不在、付けば属性が設定済み
      const oldItem = (error as { Item?: Record<string, unknown> }).Item;
      const missing = new EntityNotFoundError(this.mapper.entityType, describeKey(keys));
      if (!oldItem || Object.keys(oldItem).length === 0) {
        throw missing;
      }
      // 条件失敗の Item は生の AttributeValue 形式のため使わず、強い整合性で読み直して Entity にする
      const existing = await this.getByKeys(keys, true);
      if (!existing) {
        throw missing;
      }
      return { entity: existing, updated: false };
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

  /** Key で Item を読んで Entity にする。なければ null */
  private async getByKeys(keys: DynamoDBKey, consistentRead?: boolean): Promise<TEntity | null> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: keys,
          ConsistentRead: consistentRead,
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

  /** 無いときだけ書く。既にあれば `options` に応じたエラーを投げる */
  private async putIfAbsent(
    keys: DynamoDBKey,
    item: DynamoDBAttributes,
    options: EntityCreateOptions
  ): Promise<void> {
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
        throw createConflictError(this.mapper.entityType, keys, options);
      }
      throw toDatabaseError(error);
    }
  }

  /**
   * update の式を組み立てて送り、更新後の Entity を返す。
   * 条件とその失敗時の扱いは呼び出し側が決めるため、例外は変換せずそのまま投げる。
   */
  private async sendUpdate(
    keys: DynamoDBKey,
    fields: Record<string, unknown>,
    condition: UpdateCondition
  ): Promise<TEntity> {
    const parts = buildUpdateExpression(fields, {
      timestamp: { attributeName: UPDATED_AT_ATTRIBUTE, value: this.now() },
      updateTimestampWhenEmpty: true,
    });
    if (!parts) {
      // timestamp を渡しているため到達しない。型の絞り込みのために明示する
      throw new InvalidEntityDataError(ENTITY_STORE_ERROR_MESSAGES.UPDATE_RESULT_MISSING);
    }

    const values = { ...parts.ExpressionAttributeValues, ...condition.ExpressionAttributeValues };
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
  ): UpdateCondition {
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
