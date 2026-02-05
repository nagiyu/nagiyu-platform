/**
 * DynamoDB Repository 抽象基底クラス
 *
 * CRUD操作の共通実装を提供する抽象基底クラス
 */

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { DynamoDBItem, RepositoryConfig } from './types.js';
import {
  EntityNotFoundError,
  EntityAlreadyExistsError,
  DatabaseError,
  InvalidEntityDataError,
} from './errors.js';
import { conditionalPut, conditionalUpdate, conditionalDelete } from './helpers.js';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';

/**
 * DynamoDB Repository 抽象基底クラス
 *
 * @template TEntity - エンティティの型
 * @template TKey - キーの型（PK/SKを含むオブジェクト）
 *
 * @example
 * ```typescript
 * class UserRepository extends AbstractDynamoDBRepository<User, { userId: string }> {
 *   constructor(docClient: DynamoDBDocumentClient) {
 *     super(docClient, {
 *       tableName: 'MyTable',
 *       entityType: 'User'
 *     });
 *   }
 *
 *   protected buildKeys(key: { userId: string }) {
 *     return {
 *       PK: `USER#${key.userId}`,
 *       SK: 'PROFILE'
 *     };
 *   }
 *
 *   protected mapToEntity(item: Record<string, unknown>): User {
 *     return {
 *       userId: validateStringField(item.UserId, 'UserId'),
 *       name: validateStringField(item.Name, 'Name'),
 *       createdAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
 *       updatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt')
 *     };
 *   }
 *
 *   protected mapToItem(entity: Omit<User, 'createdAt' | 'updatedAt'>): DynamoDBItem {
 *     const keys = this.buildKeys({ userId: entity.userId });
 *     return {
 *       ...keys,
 *       Type: this.config.entityType,
 *       UserId: entity.userId,
 *       Name: entity.name,
 *       CreatedAt: Date.now(),
 *       UpdatedAt: Date.now()
 *     };
 *   }
 * }
 * ```
 */
export abstract class AbstractDynamoDBRepository<TEntity, TKey> {
  protected readonly docClient: DynamoDBDocumentClient;
  protected readonly config: RepositoryConfig;

  constructor(docClient: DynamoDBDocumentClient, config: RepositoryConfig) {
    this.docClient = docClient;
    this.config = config;
  }

  /**
   * PK/SK を構築（サブクラスで実装）
   *
   * @param key - キー情報
   * @returns PK と SK を含むオブジェクト
   */
  protected abstract buildKeys(key: TKey): { PK: string; SK: string };

  /**
   * DynamoDB Item を Entity にマッピング（サブクラスで実装）
   *
   * @param item - DynamoDB Item
   * @returns エンティティ
   */
  protected abstract mapToEntity(item: Record<string, unknown>): TEntity;

  /**
   * Entity を DynamoDB Item にマッピング（サブクラスで実装）
   *
   * @param entity - エンティティ（CreatedAt/UpdatedAt を除く）
   * @returns DynamoDB Item（CreatedAt/UpdatedAt を除く）
   */
  protected abstract mapToItem(
    entity: Omit<TEntity, 'CreatedAt' | 'UpdatedAt'>
  ): Omit<DynamoDBItem, 'CreatedAt' | 'UpdatedAt'>;

  /**
   * ID でエンティティを取得
   *
   * @param key - キー情報
   * @returns エンティティ（存在しない場合は null）
   * @throws DatabaseError データベースエラー発生時
   * @throws InvalidEntityDataError マッピングエラー発生時
   */
  public async getById(key: TKey): Promise<TEntity | null> {
    try {
      const keys = this.buildKeys(key);
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.config.tableName,
          Key: keys,
        })
      );

      if (!result.Item) {
        return null;
      }

      return this.mapToEntity(result.Item);
    } catch (error) {
      if (error instanceof InvalidEntityDataError) {
        throw error;
      }
      throw new DatabaseError(
        `エンティティ取得エラー: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 新しいエンティティを作成
   *
   * @param entity - エンティティ（CreatedAt/UpdatedAt を除く）
   * @returns 作成されたエンティティ（CreatedAt/UpdatedAt を含む）
   * @throws EntityAlreadyExistsError エンティティが既に存在する場合
   * @throws DatabaseError データベースエラー発生時
   */
  public async create(entity: Omit<TEntity, 'CreatedAt' | 'UpdatedAt'>): Promise<TEntity> {
    try {
      const now = Date.now();
      const baseItem = this.mapToItem(entity);

      // Type assertion needed because TypeScript can't infer that baseItem contains PK, SK, Type
      // when combined with CreatedAt/UpdatedAt via spread operator
      const item = {
        ...baseItem,
        CreatedAt: now,
        UpdatedAt: now,
      } as DynamoDBItem;

      await this.docClient.send(
        new PutCommand(
          conditionalPut({
            TableName: this.config.tableName,
            Item: item,
          })
        )
      );

      return this.mapToEntity(item);
    } catch (error) {
      if (
        error instanceof ConditionalCheckFailedException ||
        (error instanceof Error && error.name === 'ConditionalCheckFailedException')
      ) {
        throw new EntityAlreadyExistsError(this.config.entityType, JSON.stringify(entity));
      }
      throw new DatabaseError(
        `エンティティ作成エラー: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * エンティティを更新
   *
   * @param key - キー情報
   * @param updates - 更新するフィールドと値のマップ
   * @returns 更新されたエンティティ
   * @throws EntityNotFoundError エンティティが存在しない場合
   * @throws DatabaseError データベースエラー発生時
   */
  public async update(key: TKey, updates: Partial<TEntity>): Promise<TEntity> {
    try {
      const keys = this.buildKeys(key);
      const now = Date.now();

      // UpdateExpression を動的に生成
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, unknown> = {};

      let fieldIndex = 0;
      let hasUpdates = false;

      for (const [field, value] of Object.entries(updates)) {
        if (field === 'CreatedAt' || field === 'UpdatedAt') {
          // タイムスタンプフィールドは自動管理のためスキップ
          continue;
        }

        const attrName = `#field${fieldIndex}`;
        const attrValue = `:value${fieldIndex}`;
        fieldIndex++;

        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = field;
        expressionAttributeValues[attrValue] = value;
        hasUpdates = true;
      }

      if (!hasUpdates) {
        // 更新するフィールドが指定されていない
        throw new InvalidEntityDataError('更新するフィールドが指定されていません');
      }

      // UpdatedAt を自動更新
      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
      expressionAttributeValues[':updatedAt'] = now;

      await this.docClient.send(
        new UpdateCommand(
          conditionalUpdate({
            TableName: this.config.tableName,
            Key: keys,
            UpdateExpression: `SET ${updateExpressions.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
          })
        )
      );

      // 更新後のデータを取得して返す
      const updated = await this.getById(key);
      if (!updated) {
        throw new EntityNotFoundError(this.config.entityType, JSON.stringify(key));
      }

      return updated;
    } catch (error) {
      if (
        error instanceof ConditionalCheckFailedException ||
        (error instanceof Error && error.name === 'ConditionalCheckFailedException')
      ) {
        throw new EntityNotFoundError(this.config.entityType, JSON.stringify(key));
      }
      if (error instanceof EntityNotFoundError || error instanceof InvalidEntityDataError) {
        throw error;
      }
      throw new DatabaseError(
        `エンティティ更新エラー: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * エンティティを削除
   *
   * @param key - キー情報
   * @throws EntityNotFoundError エンティティが存在しない場合
   * @throws DatabaseError データベースエラー発生時
   */
  public async delete(key: TKey): Promise<void> {
    try {
      const keys = this.buildKeys(key);

      await this.docClient.send(
        new DeleteCommand(
          conditionalDelete({
            TableName: this.config.tableName,
            Key: keys,
          })
        )
      );
    } catch (error) {
      if (
        error instanceof ConditionalCheckFailedException ||
        (error instanceof Error && error.name === 'ConditionalCheckFailedException')
      ) {
        throw new EntityNotFoundError(this.config.entityType, JSON.stringify(key));
      }
      throw new DatabaseError(
        `エンティティ削除エラー: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}
