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
  mapConditionalCheckFailed,
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
import { toErrorMessage } from '@nagiyu/common';

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
   * ExchangeTickerIndex(GSI3PK 固定値)の Query で取得するため、テーブル全体を走査しない。
   * Query 結果が 0 件のときだけ Scan(Type フィルタ)にフォールバックする。GSI キーは
   * 作成時と更新時にしか付かないため、キー導入前の既存データやデータ同期で上書きされた
   * 環境では Query が空になり、そのまま返すと一覧が空になってしまうため。
   * 返却順序は保証しない(Query 経路は ExchangeID 昇順、Scan 経路は不定)。
   */
  public async getAll(): Promise<ExchangeEntity[]> {
    try {
      const indexed = await queryExchangeItems(this.docClient, this.config.tableName);
      if (indexed.length > 0) {
        return indexed.map((item) => this.mapper.toEntity(item));
      }
      return await this.scanAll();
    } catch (error) {
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Type フィルタ付き Scan で全取引所を取得する(GSI キー未付与データ向けのフォールバック)
   */
  private async scanAll(): Promise<ExchangeEntity[]> {
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

      // 更新式を動的に構築（SET句とREMOVE句を分けて組み立てる）
      const updateExpressions: string[] = [];
      const removeExpressions: string[] = [];
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
      if (updates.PriceSource !== undefined) {
        updateExpressions.push('#priceSource = :priceSource');
        expressionAttributeNames['#priceSource'] = 'PriceSource';
        expressionAttributeValues[':priceSource'] = updates.PriceSource;
      }
      // Market は undefined（更新しない）・null（未設定に戻す＝REMOVE）・値（SET）の3値を区別する
      if (updates.Market !== undefined) {
        expressionAttributeNames['#market'] = 'Market';
        if (updates.Market === null) {
          removeExpressions.push('#market');
        } else {
          updateExpressions.push('#market = :market');
          expressionAttributeValues[':market'] = updates.Market;
        }
      }

      // 更新のたびに GSI3 キーを付け直す。キー導入前に作られた既存アイテムは、
      // 画面から保存し直すことで getAll の Query 対象になる。
      updateExpressions.push('#gsi3pk = :gsi3pk', '#gsi3sk = :gsi3sk');
      expressionAttributeNames['#gsi3pk'] = 'GSI3PK';
      expressionAttributeNames['#gsi3sk'] = 'GSI3SK';
      expressionAttributeValues[':gsi3pk'] = EXCHANGE_GSI3_PK;
      expressionAttributeValues[':gsi3sk'] = buildExchangeGsi3Sk(exchangeId);

      // UpdatedAt を常に更新
      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
      expressionAttributeValues[':updatedAt'] = now;

      const updateExpressionParts = [`SET ${updateExpressions.join(', ')}`];
      if (removeExpressions.length > 0) {
        updateExpressionParts.push(`REMOVE ${removeExpressions.join(', ')}`);
      }

      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.config.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: updateExpressionParts.join(' '),
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
      mapConditionalCheckFailed(error, {
        onMissing: () => {
          throw new EntityNotFoundError('Exchange', exchangeId);
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
