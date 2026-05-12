/**
 * Stock Tracker Core - DynamoDB Daily Summary Repository
 *
 * DynamoDBを使用したDailySummaryRepositoryの実装
 */

import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  DatabaseError,
  EntityAlreadyExistsError,
  EntityNotFoundError,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type {
  DailySummaryEvaluationFields,
  DailySummaryRepository,
} from './daily-summary.repository.interface.js';
import type {
  DailySummaryEntity,
  DailySummaryKey,
  CreateDailySummaryInput,
} from '../entities/daily-summary.entity.js';
import { DailySummaryMapper } from '../mappers/daily-summary.mapper.js';

/**
 * DynamoDB Daily Summary Repository
 *
 * DynamoDBを使用した日次サマリーリポジトリの実装
 */
export class DynamoDBDailySummaryRepository implements DailySummaryRepository {
  private readonly mapper: DailySummaryMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new DailySummaryMapper();
  }

  /**
   * TickerID と Date でサマリーを取得
   */
  public async getByTickerAndDate(
    tickerId: string,
    date: string
  ): Promise<DailySummaryEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ tickerId, date });

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );

      if (!result.Item) {
        return null;
      }

      return this.mapper.toEntity(result.Item as unknown as DynamoDBItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 取引所IDでサマリーを取得（GSI4使用）
   */
  public async getByExchange(exchangeId: string, date?: string): Promise<DailySummaryEntity[]> {
    try {
      const items: DynamoDBItem[] = [];
      let lastEvaluatedKey: Record<string, unknown> | undefined;

      do {
        const result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            IndexName: 'ExchangeSummaryIndex',
            KeyConditionExpression: date
              ? '#gsi4pk = :exchangeId AND begins_with(#gsi4sk, :datePrefix)'
              : '#gsi4pk = :exchangeId',
            ExpressionAttributeNames: date
              ? {
                  '#gsi4pk': 'GSI4PK',
                  '#gsi4sk': 'GSI4SK',
                }
              : {
                  '#gsi4pk': 'GSI4PK',
                },
            ExpressionAttributeValues: date
              ? {
                  ':exchangeId': exchangeId,
                  ':datePrefix': `DATE#${date}`,
                }
              : {
                  ':exchangeId': exchangeId,
                },
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );

        items.push(...((result.Items as DynamoDBItem[] | undefined) ?? []));
        lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastEvaluatedKey);

      const summaries = items.map((item) => this.mapper.toEntity(item));

      if (date || summaries.length === 0) {
        return summaries;
      }

      const latestDate = summaries.reduce((latest, summary) => {
        return summary.Date > latest ? summary.Date : latest;
      }, summaries[0].Date);

      return summaries.filter((summary) => summary.Date === latestDate);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 取引所IDと日付範囲でサマリーを取得（GSI4使用、両端含む）
   *
   * GSI4SK は `DATE#{Date}#{TickerID}` 形式のため、`DATE#{toDate}` の prefix だけでは
   * `toDate` の項目を漏らしてしまう。よって ASCII でほぼ最大の `~` を末尾に付けて
   * `DATE#{toDate}#~` まで含める。
   */
  public async getByExchangeAndDateRange(
    exchangeId: string,
    fromDate: string,
    toDate: string
  ): Promise<DailySummaryEntity[]> {
    try {
      const items: DynamoDBItem[] = [];
      let lastEvaluatedKey: Record<string, unknown> | undefined;

      do {
        const result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            IndexName: 'ExchangeSummaryIndex',
            KeyConditionExpression: '#gsi4pk = :exchangeId AND #gsi4sk BETWEEN :from AND :to',
            ExpressionAttributeNames: {
              '#gsi4pk': 'GSI4PK',
              '#gsi4sk': 'GSI4SK',
            },
            ExpressionAttributeValues: {
              ':exchangeId': exchangeId,
              ':from': `DATE#${fromDate}`,
              ':to': `DATE#${toDate}#~`,
            },
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );

        items.push(...((result.Items as DynamoDBItem[] | undefined) ?? []));
        lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastEvaluatedKey);

      return items.map((item) => this.mapper.toEntity(item));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * サマリーを保存（既存の場合は上書き）
   */
  public async upsert(input: CreateDailySummaryInput): Promise<DailySummaryEntity> {
    try {
      const existing = await this.getByTickerAndDate(input.TickerID, input.Date);
      const now = Date.now();
      const entity: DailySummaryEntity = {
        ...input,
        CreatedAt: existing?.CreatedAt ?? now,
        UpdatedAt: now,
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.mapper.toItem(entity),
        })
      );

      return entity;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 採点結果を既存 DailySummary に書き込む（条件付き UpdateItem）
   *
   * - 条件 `attribute_exists(PK)` で対象 DailySummary が存在することを保証
   * - 条件 `attribute_not_exists(EvaluatedAt)` で二重採点を防止
   * - いずれか違反時は `ConditionalCheckFailedException` が発生し、
   *   存在しない場合は `EntityNotFoundError`、既採点の場合は `EntityAlreadyExistsError` に変換する
   */
  public async markAsEvaluated(
    key: DailySummaryKey,
    fields: DailySummaryEvaluationFields
  ): Promise<void> {
    try {
      const { pk, sk } = this.mapper.buildKeys(key);
      const now = Date.now();

      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression:
            'SET #evaluationDate = :evaluationDate, #evaluationClose = :evaluationClose, #actualReturn = :actualReturn, #hit = :hit, #evaluationThresholdPercent = :evaluationThresholdPercent, #evaluatedAt = :evaluatedAt, #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#evaluationDate': 'EvaluationDate',
            '#evaluationClose': 'EvaluationClose',
            '#actualReturn': 'ActualReturn',
            '#hit': 'Hit',
            '#evaluationThresholdPercent': 'EvaluationThresholdPercent',
            '#evaluatedAt': 'EvaluatedAt',
            '#updatedAt': 'UpdatedAt',
          },
          ExpressionAttributeValues: {
            ':evaluationDate': fields.EvaluationDate,
            ':evaluationClose': fields.EvaluationClose,
            ':actualReturn': fields.ActualReturn,
            ':hit': fields.Hit,
            ':evaluationThresholdPercent': fields.EvaluationThresholdPercent,
            ':evaluatedAt': fields.EvaluatedAt,
            ':updatedAt': now,
          },
          ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(EvaluatedAt)',
        })
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        const identifier = `${key.tickerId}#${key.date}`;
        // 既採点 vs 未存在を区別するために GetItem で再確認
        const existing = await this.getByTickerAndDate(key.tickerId, key.date);
        if (!existing) {
          throw new EntityNotFoundError('DailySummary', identifier);
        }
        throw new EntityAlreadyExistsError('DailySummaryEvaluation', identifier);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
