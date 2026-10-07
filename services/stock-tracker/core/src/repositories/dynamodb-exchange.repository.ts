/**
 * Stock Tracker Core - DynamoDB Exchange Repository
 *
 * DynamoDBを使用したExchangeRepositoryの実装
 */

import { UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  AbstractDynamoDBRepository,
  EntityNotFoundError,
  DatabaseError,
  mapConditionalCheckFailed,
  toDatabaseError,
  buildUpdateExpression,
  REMOVE_ATTRIBUTE,
  scanAllItems,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { ExchangeRepository } from './exchange.repository.interface.js';
import type { ExchangeEntity, UpdateExchangeInput } from '../entities/exchange.entity.js';
import {
  ExchangeMapper,
  EXCHANGE_GSI3_PK,
  buildExchangeGsi3Sk,
} from '../mappers/exchange.mapper.js';
import { queryExchangeItems } from './query-exchange-index.js';

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
      GSI3PK: EXCHANGE_GSI3_PK,
      GSI3SK: buildExchangeGsi3Sk(entity.ExchangeID),
      ExchangeID: entity.ExchangeID,
      Name: entity.Name,
      Key: entity.Key,
      Timezone: entity.Timezone,
      Start: entity.Start,
      End: entity.End,
      PriceSource: entity.PriceSource,
      ...(entity.Market !== undefined ? { Market: entity.Market } : {}),
    };
  }

  /**
   * 全取引所を取得
   *
   * Type フィルタ付き Scan で取得するため、GSI キーの有無にかかわらず常に全件を返す。
   * 返却順序は保証しない。LastEvaluatedKey ループで全件を集約する。
   */
  public async getAll(): Promise<ExchangeEntity[]> {
    try {
      return await this.scanAll();
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * ExchangeTickerIndex の Query で取引所を取得する(GSI キー付きのみ)
   *
   * テーブル全体を走査しないため速い。一方で GSI キーは作成時と更新時にしか付かないので、
   * キー未付与の取引所が混在する移行途中では、それらが結果から欠ける。
   * Query が 0 件のときだけ Scan にフォールバックする。
   * 欠けても許容できる読み取り専用の一覧表示でのみ使い、それ以外は getAll を使うこと。
   * 返却順序は保証しない(Query 経路は ExchangeID 昇順、Scan 経路は不定)。
   */
  public async getAllIndexed(): Promise<ExchangeEntity[]> {
    try {
      const indexed = await queryExchangeItems(this.docClient, this.config.tableName);
      if (indexed.length > 0) {
        return indexed.map((item) => this.mapper.toEntity(item));
      }
      return await this.scanAll();
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * Type フィルタ付き Scan で全取引所を取得する
   */
  private async scanAll(): Promise<ExchangeEntity[]> {
    const items = await scanAllItems(this.docClient, {
      TableName: this.config.tableName,
      FilterExpression: '#type = :type',
      ExpressionAttributeNames: {
        '#type': 'Type',
      },
      ExpressionAttributeValues: {
        ':type': 'Exchange',
      },
    });
    return items.map((item) => this.mapper.toEntity(item));
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
      const fields = {
        Name: updates.Name,
        Timezone: updates.Timezone,
        Start: updates.Start,
        End: updates.End,
        PriceSource: updates.PriceSource,
        // Market は undefined (更新しない)・null (未設定に戻す = REMOVE)・値 (SET) の 3 値を区別する
        Market: updates.Market === null ? REMOVE_ATTRIBUTE : updates.Market,
        // 更新のたびに GSI3 キーを付け直す。キー導入前に作られた既存アイテムは、
        // 画面から保存し直すことで getAllIndexed の Query 対象になる。
        GSI3PK: EXCHANGE_GSI3_PK,
        GSI3SK: buildExchangeGsi3Sk(exchangeId),
      };
      const updateParts = buildUpdateExpression(fields, {
        timestamp: { attributeName: 'UpdatedAt', value: Date.now() },
      });
      if (!updateParts) {
        throw new DatabaseError(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
      }

      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.config.tableName,
          Key: { PK: pk, SK: sk },
          ...updateParts,
          ConditionExpression: 'attribute_exists(PK)',
          ReturnValues: 'ALL_NEW',
        })
      );

      if (!result.Attributes) {
        throw new EntityNotFoundError('Exchange', exchangeId);
      }

      return this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem);
    } catch (error) {
      mapConditionalCheckFailed(error, {
        onMissing: () => {
          throw new EntityNotFoundError('Exchange', exchangeId);
        },
      });
      throw toDatabaseError(error);
    }
  }
}
