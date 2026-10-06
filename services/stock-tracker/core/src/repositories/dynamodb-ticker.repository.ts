/**
 * Stock Tracker Core - DynamoDB Ticker Repository
 *
 * DynamoDBを使用したTickerRepositoryの実装
 */

import { UpdateCommand, ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  AbstractDynamoDBRepository,
  EntityNotFoundError,
  DatabaseError,
  mapConditionalCheckFailed,
  toDatabaseError,
  queryAllItems,
  scanAllItems,
  encodeCursor,
  decodeCursor,
  type PaginationOptions,
  type PaginatedResult,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { TickerRepository } from './ticker.repository.interface.js';
import type { TickerEntity, UpdateTickerInput } from '../entities/ticker.entity.js';
import { TickerMapper } from '../mappers/ticker.mapper.js';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  NO_UPDATES_SPECIFIED: '更新するフィールドが指定されていません',
} as const;

/**
 * DynamoDB Ticker Repository
 *
 * DynamoDBを使用したティッカーリポジトリの実装
 */
export class DynamoDBTickerRepository
  extends AbstractDynamoDBRepository<TickerEntity, string>
  implements TickerRepository
{
  private readonly mapper: TickerMapper;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    super(docClient, { tableName, entityType: 'Ticker' });
    this.mapper = new TickerMapper();
  }

  protected buildKeys(tickerId: string): { PK: string; SK: string } {
    const { pk, sk } = this.mapper.buildKeys({ tickerId });
    return { PK: pk, SK: sk };
  }

  protected mapToEntity(item: Record<string, unknown>): TickerEntity {
    return this.mapper.toEntity(item as DynamoDBItem);
  }

  protected mapToItem(
    entity: Omit<TickerEntity, 'CreatedAt' | 'UpdatedAt'>
  ): Omit<DynamoDBItem, 'CreatedAt' | 'UpdatedAt'> {
    const { pk, sk } = this.mapper.buildKeys({ tickerId: entity.TickerID });
    return {
      PK: pk,
      SK: sk,
      Type: 'Ticker',
      GSI3PK: entity.ExchangeID,
      GSI3SK: `TICKER#${entity.TickerID}`,
      TickerID: entity.TickerID,
      Symbol: entity.Symbol,
      Name: entity.Name,
      ExchangeID: entity.ExchangeID,
    };
  }

  /**
   * 取引所ごとのティッカー一覧を取得（GSI3=ExchangeTickerIndexを使用）
   *
   * GSI3SK（`TICKER#{TickerID}`）昇順のQueryで、インタフェース契約のTickerID昇順を実現する。
   * LastEvaluatedKeyがなくなるまでQueryをループして全件を集約する契約のため、
   * Limitは指定しない（DynamoDBの1MBページ単位）。
   */
  public async getByExchange(exchangeId: string): Promise<TickerEntity[]> {
    try {
      const items = await queryAllItems(this.docClient, {
        TableName: this.config.tableName,
        IndexName: 'ExchangeTickerIndex',
        KeyConditionExpression: '#gsi3pk = :exchangeId',
        ExpressionAttributeNames: {
          '#gsi3pk': 'GSI3PK',
        },
        ExpressionAttributeValues: {
          ':exchangeId': exchangeId,
        },
      });
      return items.map((item) => this.mapper.toEntity(item));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * 全ティッカー取得（Scan with filter）
   *
   * ScanはGSIを介さず全件を走査するため、返却順序を保証しない。options未指定時は
   * LastEvaluatedKeyループで全件集約し、nextCursorはundefinedを返す。
   */
  public async getAll(options?: PaginationOptions): Promise<PaginatedResult<TickerEntity>> {
    try {
      const usePagination = options?.limit !== undefined || options?.cursor !== undefined;

      if (!usePagination) {
        const items = await scanAllItems(this.docClient, {
          TableName: this.config.tableName,
          FilterExpression: '#type = :type',
          ExpressionAttributeNames: {
            '#type': 'Type',
          },
          ExpressionAttributeValues: {
            ':type': 'Ticker',
          },
        });
        const allItems = items.map((item) => this.mapper.toEntity(item));

        return {
          items: allItems,
          nextCursor: undefined,
          count: allItems.length,
        };
      }

      const limit = options?.limit || 50;
      const exclusiveStartKey = decodeCursor(options?.cursor);

      const result = await this.docClient.send(
        new ScanCommand({
          TableName: this.config.tableName,
          FilterExpression: '#type = :type',
          ExpressionAttributeNames: {
            '#type': 'Type',
          },
          ExpressionAttributeValues: {
            ':type': 'Ticker',
          },
          Limit: limit,
          ExclusiveStartKey: exclusiveStartKey,
        })
      );

      const items = (result.Items || []).map((item) =>
        this.mapper.toEntity(item as unknown as DynamoDBItem)
      );
      const nextCursor = encodeCursor(result.LastEvaluatedKey);

      return {
        items,
        nextCursor,
        count: result.Count,
      };
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * ティッカーを更新
   */
  public async update(tickerId: string, updates: UpdateTickerInput): Promise<TickerEntity> {
    try {
      // 更新するフィールドがない場合はエラー
      if (Object.keys(updates).length === 0) {
        throw new DatabaseError(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
      }

      const { pk, sk } = this.mapper.buildKeys({ tickerId });
      const now = Date.now();

      // 更新式を動的に構築
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, unknown> = {};

      if (updates.Symbol !== undefined) {
        updateExpressions.push('#symbol = :symbol');
        expressionAttributeNames['#symbol'] = 'Symbol';
        expressionAttributeValues[':symbol'] = updates.Symbol;
      }
      if (updates.Name !== undefined) {
        updateExpressions.push('#name = :name');
        expressionAttributeNames['#name'] = 'Name';
        expressionAttributeValues[':name'] = updates.Name;
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
        throw new EntityNotFoundError('Ticker', tickerId);
      }

      return this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem);
    } catch (error) {
      mapConditionalCheckFailed(error, {
        onMissing: () => {
          throw new EntityNotFoundError('Ticker', tickerId);
        },
      });
      throw toDatabaseError(error);
    }
  }
}
