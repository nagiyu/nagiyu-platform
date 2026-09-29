/**
 * Stock Tracker Core - DynamoDB Ticker Repository
 *
 * DynamoDBを使用したTickerRepositoryの実装
 */

import {
  UpdateCommand,
  QueryCommand,
  ScanCommand,
  type DynamoDBDocumentClient,
  type ScanCommandInput,
  type QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import {
  AbstractDynamoDBRepository,
  EntityNotFoundError,
  DatabaseError,
  mapConditionalCheckFailed,
  encodeCursor,
  decodeCursor,
  type PaginationOptions,
  type PaginatedResult,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { TickerRepository } from './ticker.repository.interface.js';
import type { TickerEntity, UpdateTickerInput } from '../entities/ticker.entity.js';
import { TickerMapper } from '../mappers/ticker.mapper.js';
import { queryExchangeItems } from './query-exchange-index.js';
import { toErrorMessage } from '@nagiyu/common';

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
    const items: TickerEntity[] = [];
    let exclusiveStartKey: QueryCommandOutput['LastEvaluatedKey'];

    try {
      do {
        const result: QueryCommandOutput = await this.docClient.send(
          new QueryCommand({
            TableName: this.config.tableName,
            IndexName: 'ExchangeTickerIndex',
            KeyConditionExpression: '#gsi3pk = :exchangeId',
            ExpressionAttributeNames: {
              '#gsi3pk': 'GSI3PK',
            },
            ExpressionAttributeValues: {
              ':exchangeId': exchangeId,
            },
            ExclusiveStartKey: exclusiveStartKey,
          })
        );

        for (const item of result.Items || []) {
          items.push(this.mapper.toEntity(item as unknown as DynamoDBItem));
        }

        exclusiveStartKey = result.LastEvaluatedKey;
      } while (exclusiveStartKey);
    } catch (error) {
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }

    return items;
  }

  /**
   * 全ティッカー取得
   *
   * 返却順序は保証しない。options未指定時は全件集約し、nextCursorはundefinedを返す。
   * options指定時はカーソル形式を保つため従来どおりScanでページングする。
   */
  public async getAll(options?: PaginationOptions): Promise<PaginatedResult<TickerEntity>> {
    try {
      const usePagination = options?.limit !== undefined || options?.cursor !== undefined;

      if (!usePagination) {
        const allItems = await this.getAllWithoutPagination();
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
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * options 未指定の全件取得
   *
   * 取引所一覧(ExchangeTickerIndex)を引き、取引所ごとに getByExchange の Query で集める。
   * テーブル全体の Scan を避けるため。取引所一覧が 0 件(GSI キー未付与の環境)のときだけ
   * 従来どおり Type フィルタ付き Scan にフォールバックし、銘柄が取れなくなるのを防ぐ。
   */
  private async getAllWithoutPagination(): Promise<TickerEntity[]> {
    const exchangeItems = await queryExchangeItems(this.docClient, this.config.tableName);
    if (exchangeItems.length === 0) {
      return this.scanAllTickers();
    }

    const exchangeIds = exchangeItems.map((item) => String(item.ExchangeID));
    const perExchange = await Promise.all(exchangeIds.map((id) => this.getByExchange(id)));
    return perExchange.flat();
  }

  /**
   * Type フィルタ付き Scan で全ティッカーを取得する(フォールバック用)
   */
  private async scanAllTickers(): Promise<TickerEntity[]> {
    const allItems: TickerEntity[] = [];
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
            ':type': 'Ticker',
          },
          ExclusiveStartKey: exclusiveStartKey,
        })
      );

      for (const item of result.Items || []) {
        allItems.push(this.mapper.toEntity(item as unknown as DynamoDBItem));
      }
      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return allItems;
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
      // EntityNotFoundError はそのまま投げる
      if (error instanceof EntityNotFoundError) {
        throw error;
      }
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
