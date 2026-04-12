/**
 * Stock Tracker Core - DynamoDB Exchange Repository
 *
 * DynamoDBを使用したExchangeRepositoryの実装
 */

import {
  UpdateCommand,
  ScanCommand,
  type DynamoDBDocumentClient,
  type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  AbstractDynamoDBRepository,
  EntityNotFoundError,
  DatabaseError,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { ExchangeRepository } from './exchange.repository.interface.js';
import type { ExchangeEntity, UpdateExchangeInput } from '../entities/exchange.entity.js';
import { ExchangeMapper } from '../mappers/exchange.mapper.js';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  NO_UPDATES_SPECIFIED: '更新するフィールドが指定されていません',
} as const;

/**
 * DynamoDB Exchange Repository
 *
 * DynamoDBを使用した取引所リポジトリの実装
 */
export class DynamoDBExchangeRepository
  extends AbstractDynamoDBRepository<ExchangeEntity, string>
  implements ExchangeRepository
{
  private readonly mapper: ExchangeMapper;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    super(docClient, { tableName, entityType: 'Exchange' });
    this.mapper = new ExchangeMapper();
  }

  protected buildKeys(exchangeId: string): { PK: string; SK: string } {
    const { pk, sk } = this.mapper.buildKeys({ exchangeId });
    return { PK: pk, SK: sk };
  }

  protected mapToEntity(item: Record<string, unknown>): ExchangeEntity {
    return this.mapper.toEntity(item as DynamoDBItem);
  }

  protected mapToItem(
    entity: Omit<ExchangeEntity, 'CreatedAt' | 'UpdatedAt'>
  ): Omit<DynamoDBItem, 'CreatedAt' | 'UpdatedAt'> {
    const { pk, sk } = this.mapper.buildKeys({ exchangeId: entity.ExchangeID });
    return {
      PK: pk,
      SK: sk,
      Type: 'Exchange',
      ExchangeID: entity.ExchangeID,
      Name: entity.Name,
      Key: entity.Key,
      Timezone: entity.Timezone,
      Start: entity.Start,
      End: entity.End,
    };
  }

  /**
   * 全取引所を取得
   */
  public async getAll(): Promise<ExchangeEntity[]> {
    try {
      const allItems: ExchangeEntity[] = [];
      let exclusiveStartKey: ScanCommandInput['ExclusiveStartKey'];

      do {
        const result = await this.docClient.send(
          new ScanCommand({
            TableName: this.config.tableName,
            FilterExpression: '#type = :type',
            ExpressionAttributeNames: {
              '#type': 'Type',
            },
            ExpressionAttributeValues: {
              ':type': 'Exchange',
            },
            ExclusiveStartKey: exclusiveStartKey,
          })
        );

        const pageItems = (result.Items || []).map((item) =>
          this.mapper.toEntity(item as unknown as DynamoDBItem)
        );
        allItems.push(...pageItems);
        exclusiveStartKey = result.LastEvaluatedKey;
      } while (exclusiveStartKey);

      return allItems;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 取引所を更新
   */
  public async update(exchangeId: string, updates: UpdateExchangeInput): Promise<ExchangeEntity> {
    try {
      // 更新するフィールドがない場合はエラー
      if (Object.keys(updates).length === 0) {
        throw new DatabaseError(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
      }

      const { pk, sk } = this.mapper.buildKeys({ exchangeId });
      const now = Date.now();

      // 更新式を動的に構築
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, unknown> = {};

      if (updates.Name !== undefined) {
        updateExpressions.push('#name = :name');
        expressionAttributeNames['#name'] = 'Name';
        expressionAttributeValues[':name'] = updates.Name;
      }
      if (updates.Timezone !== undefined) {
        updateExpressions.push('#timezone = :timezone');
        expressionAttributeNames['#timezone'] = 'Timezone';
        expressionAttributeValues[':timezone'] = updates.Timezone;
      }
      if (updates.Start !== undefined) {
        updateExpressions.push('#start = :start');
        expressionAttributeNames['#start'] = 'Start';
        expressionAttributeValues[':start'] = updates.Start;
      }
      if (updates.End !== undefined) {
        updateExpressions.push('#end = :end');
        expressionAttributeNames['#end'] = 'End';
        expressionAttributeValues[':end'] = updates.End;
      }

      // UpdatedAt を常に更新
      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
      expressionAttributeValues[':updatedAt'] = now;

      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.config.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression: 'attribute_exists(PK)',
          ReturnValues: 'ALL_NEW',
        })
      );

      if (!result.Attributes) {
        throw new EntityNotFoundError('Exchange', exchangeId);
      }

      return this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem);
    } catch (error) {
      // 条件チェック失敗（アイテムが存在しない）
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityNotFoundError('Exchange', exchangeId);
      }
      // EntityNotFoundError はそのまま投げる
      if (error instanceof EntityNotFoundError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
