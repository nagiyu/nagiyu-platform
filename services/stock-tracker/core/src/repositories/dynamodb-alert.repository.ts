/**
 * Stock Tracker Core - DynamoDB Alert Repository
 *
 * DynamoDBを使用したAlertRepositoryの実装
 */

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
  type QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import {
  EntityNotFoundError,
  EntityAlreadyExistsError,
  DatabaseError,
  type PaginationOptions,
  type PaginatedResult,
  type DynamoDBItem,
} from '@nagiyu/aws';
import { logger } from '@nagiyu/common';
import type { AlertRepository, GetByUserIdOptions } from './alert.repository.interface.js';
import type { AlertEntity, CreateAlertInput, UpdateAlertInput } from '../entities/alert.entity.js';
import type { TemporaryAlertCandidate } from '../entities/temporary-alert-candidate.entity.js';
import { AlertMapper } from '../mappers/alert.mapper.js';
import { randomUUID } from 'crypto';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  NO_UPDATES_SPECIFIED: '更新するフィールドが指定されていません',
} as const;

/**
 * DynamoDB Alert Repository
 *
 * DynamoDBを使用したアラートリポジトリの実装
 */
export class DynamoDBAlertRepository implements AlertRepository {
  private readonly mapper: AlertMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new AlertMapper();
  }

  /**
   * ユーザーIDとアラートIDで単一のアラートを取得
   */
  public async getById(userId: string, alertId: string): Promise<AlertEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, alertId });

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
   * ユーザーのアラート一覧を取得（GSI1使用）。
   *
   * 論理削除待ち（TTL 属性が設定済み = 一時アラート失効バッチで `markTemporaryAsExpired`
   * された）のアイテムは常に除外する。ユーザーが手動で無効化したアラート
   * （`Enabled=false` で TTL は未設定）は引き続き返す。
   */
  public async getByUserId(
    userId: string,
    options?: GetByUserIdOptions
  ): Promise<PaginatedResult<AlertEntity>> {
    let result: QueryCommandOutput;
    try {
      const limit = options?.limit || 50;
      const exclusiveStartKey = options?.cursor
        ? JSON.parse(Buffer.from(options.cursor, 'base64').toString('utf-8'))
        : undefined;

      const expressionAttributeNames: Record<string, string> = {
        '#gsi1pk': 'GSI1PK',
        '#gsi1sk': 'GSI1SK',
        '#ttl': 'TTL',
      };
      const expressionAttributeValues: Record<string, unknown> = {
        ':userId': userId,
        ':prefix': 'Alert#',
      };

      result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'UserIndex',
          KeyConditionExpression: '#gsi1pk = :userId AND begins_with(#gsi1sk, :prefix)',
          FilterExpression: 'attribute_not_exists(#ttl)',
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          Limit: limit,
          ExclusiveStartKey: exclusiveStartKey,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }

    // mapper.toEntity は同期的なデータ検証であり、ここから投げられるエラーは
    // 全て個別アイテムの検証失敗。バッチ呼び出し全体を壊さないよう、
    // エラー種別の判定に依存せず常にスキップ＆警告ログとする。
    const items: AlertEntity[] = [];
    for (const item of result.Items || []) {
      try {
        items.push(this.mapper.toEntity(item as unknown as DynamoDBItem));
      } catch (error) {
        const record = item as Record<string, unknown>;
        logger.warn('無効なアラートデータをスキップしました', {
          pk: record.PK,
          sk: record.SK,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const nextCursor = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined;

    return {
      items,
      nextCursor,
      count: result.Count,
    };
  }

  /**
   * 頻度ごとのアラート一覧を取得（GSI2使用、バッチ処理用）
   */
  public async getByFrequency(
    frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL',
    options?: PaginationOptions
  ): Promise<PaginatedResult<AlertEntity>> {
    let result: QueryCommandOutput;
    try {
      const limit = options?.limit || 50;
      const exclusiveStartKey = options?.cursor
        ? JSON.parse(Buffer.from(options.cursor, 'base64').toString('utf-8'))
        : undefined;

      result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'AlertIndex',
          KeyConditionExpression: '#gsi2pk = :pk',
          ExpressionAttributeNames: {
            '#gsi2pk': 'GSI2PK',
          },
          ExpressionAttributeValues: {
            ':pk': `ALERT#${frequency}`,
          },
          Limit: limit,
          ExclusiveStartKey: exclusiveStartKey,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }

    // mapper.toEntity は同期的なデータ検証であり、ここから投げられるエラーは
    // 全て個別アイテムの検証失敗。バッチ呼び出し全体を壊さないよう、
    // エラー種別の判定に依存せず常にスキップ＆警告ログとする。
    const items: AlertEntity[] = [];
    for (const item of result.Items || []) {
      try {
        items.push(this.mapper.toEntity(item as unknown as DynamoDBItem));
      } catch (error) {
        const record = item as Record<string, unknown>;
        logger.warn('無効なアラートデータをスキップしました', {
          pk: record.PK,
          sk: record.SK,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const nextCursor = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined;

    return {
      items,
      nextCursor,
      count: result.Count,
    };
  }

  /**
   * 一時アラート失効バッチ用の軽量取得（GSI2使用）。
   *
   * - ProjectionExpression で失効判定に必要な属性のみ取得し、subscription は読み込まない
   * - FilterExpression で `Temporary = true AND Enabled = true` のアラートのみに絞る
   *   （無効化済み一時アラートを再処理しない）
   * - mapper.toTemporaryCandidate でアイテム単位検証し、失敗時は警告ログでスキップ
   */
  public async getTemporaryCandidatesByFrequency(
    frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL',
    options?: PaginationOptions
  ): Promise<PaginatedResult<TemporaryAlertCandidate>> {
    let result: QueryCommandOutput;
    try {
      const limit = options?.limit || 50;
      const exclusiveStartKey = options?.cursor
        ? JSON.parse(Buffer.from(options.cursor, 'base64').toString('utf-8'))
        : undefined;

      result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'AlertIndex',
          KeyConditionExpression: '#gsi2pk = :pk',
          FilterExpression: '#temporary = :true AND #enabled = :true',
          ProjectionExpression:
            '#pk, #sk, #alertId, #userId, #exchangeId, #frequency, #enabled, #temporary, #temporaryExpireDate',
          ExpressionAttributeNames: {
            '#gsi2pk': 'GSI2PK',
            '#temporary': 'Temporary',
            '#enabled': 'Enabled',
            '#pk': 'PK',
            '#sk': 'SK',
            '#alertId': 'AlertID',
            '#userId': 'UserID',
            '#exchangeId': 'ExchangeID',
            '#frequency': 'Frequency',
            '#temporaryExpireDate': 'TemporaryExpireDate',
          },
          ExpressionAttributeValues: {
            ':pk': `ALERT#${frequency}`,
            ':true': true,
          },
          Limit: limit,
          ExclusiveStartKey: exclusiveStartKey,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }

    const items: TemporaryAlertCandidate[] = [];
    for (const item of result.Items || []) {
      try {
        items.push(this.mapper.toTemporaryCandidate(item as unknown as DynamoDBItem));
      } catch (error) {
        const record = item as Record<string, unknown>;
        logger.warn('無効な一時アラート候補をスキップしました', {
          pk: record.PK,
          sk: record.SK,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const nextCursor = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined;

    return {
      items,
      nextCursor,
      count: result.Count,
    };
  }

  /**
   * 新しいアラートを作成
   */
  public async create(input: CreateAlertInput): Promise<AlertEntity> {
    try {
      const now = Date.now();
      const alertId = randomUUID();
      const entity: AlertEntity = {
        ...input,
        AlertID: alertId,
        CreatedAt: now,
        UpdatedAt: now,
      };

      const item = this.mapper.toItem(entity);

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      return entity;
    } catch (error) {
      // 条件付き保存の失敗（既存アイテムが存在）
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityAlreadyExistsError('Alert', `${input.UserID}#(generated)`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * アラートを更新
   */
  public async update(
    userId: string,
    alertId: string,
    updates: UpdateAlertInput
  ): Promise<AlertEntity> {
    try {
      // 更新するフィールドがない場合はエラー
      if (Object.keys(updates).length === 0) {
        throw new DatabaseError(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
      }

      const { pk, sk } = this.mapper.buildKeys({ userId, alertId });
      const now = Date.now();

      // 更新式を動的に構築
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, unknown> = {};

      if (updates.TickerID !== undefined) {
        updateExpressions.push('#tickerId = :tickerId');
        expressionAttributeNames['#tickerId'] = 'TickerID';
        expressionAttributeValues[':tickerId'] = updates.TickerID;
      }
      if (updates.ExchangeID !== undefined) {
        updateExpressions.push('#exchangeId = :exchangeId');
        expressionAttributeNames['#exchangeId'] = 'ExchangeID';
        expressionAttributeValues[':exchangeId'] = updates.ExchangeID;
      }
      if (updates.Mode !== undefined) {
        updateExpressions.push('#mode = :mode');
        expressionAttributeNames['#mode'] = 'Mode';
        expressionAttributeValues[':mode'] = updates.Mode;
      }
      if (updates.Frequency !== undefined) {
        updateExpressions.push('#frequency = :frequency');
        expressionAttributeNames['#frequency'] = 'Frequency';
        expressionAttributeValues[':frequency'] = updates.Frequency;
        // Frequency が更新される場合、GSI2PK も更新する必要がある
        updateExpressions.push('#gsi2pk = :gsi2pk');
        expressionAttributeNames['#gsi2pk'] = 'GSI2PK';
        expressionAttributeValues[':gsi2pk'] = `ALERT#${updates.Frequency}`;
      }
      if (updates.Enabled !== undefined) {
        updateExpressions.push('#enabled = :enabled');
        expressionAttributeNames['#enabled'] = 'Enabled';
        expressionAttributeValues[':enabled'] = updates.Enabled;
      }
      if (updates.Temporary !== undefined) {
        updateExpressions.push('#temporary = :temporary');
        expressionAttributeNames['#temporary'] = 'Temporary';
        expressionAttributeValues[':temporary'] = updates.Temporary;
      }
      if (updates.TemporaryExpireDate !== undefined) {
        updateExpressions.push('#temporaryExpireDate = :temporaryExpireDate');
        expressionAttributeNames['#temporaryExpireDate'] = 'TemporaryExpireDate';
        expressionAttributeValues[':temporaryExpireDate'] = updates.TemporaryExpireDate;
      }
      if (updates.ConditionList !== undefined) {
        updateExpressions.push('#conditionList = :conditionList');
        expressionAttributeNames['#conditionList'] = 'ConditionList';
        expressionAttributeValues[':conditionList'] = updates.ConditionList;
      }
      if (updates.subscription !== undefined) {
        updateExpressions.push('#subscription = :subscription');
        expressionAttributeNames['#subscription'] = 'subscription';
        expressionAttributeValues[':subscription'] = updates.subscription;
      }
      if (updates.NotificationTitle !== undefined) {
        updateExpressions.push('#notificationTitle = :notificationTitle');
        expressionAttributeNames['#notificationTitle'] = 'NotificationTitle';
        expressionAttributeValues[':notificationTitle'] = updates.NotificationTitle;
      }
      if (updates.NotificationBody !== undefined) {
        updateExpressions.push('#notificationBody = :notificationBody');
        expressionAttributeNames['#notificationBody'] = 'NotificationBody';
        expressionAttributeValues[':notificationBody'] = updates.NotificationBody;
      }

      // UpdatedAt を常に更新
      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
      expressionAttributeValues[':updatedAt'] = now;

      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression: 'attribute_exists(PK)',
          ReturnValues: 'ALL_NEW',
        })
      );

      if (!result.Attributes) {
        throw new EntityNotFoundError('Alert', `${userId}#${alertId}`);
      }

      return this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem);
    } catch (error) {
      // 条件チェック失敗（アイテムが存在しない）
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityNotFoundError('Alert', `${userId}#${alertId}`);
      }
      // EntityNotFoundError はそのまま投げる
      if (error instanceof EntityNotFoundError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * アラートを削除
   */
  public async delete(userId: string, alertId: string): Promise<void> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, alertId });

      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          ConditionExpression: 'attribute_exists(PK)',
        })
      );
    } catch (error) {
      // 条件チェック失敗（アイテムが存在しない）
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityNotFoundError('Alert', `${userId}#${alertId}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 一時アラートを失効状態にする（無効化 + TTL 設定）。
   *
   * subscription / ConditionList を読み書きせず、Enabled を false にしつつ
   * DynamoDB TTL 属性をセットすることで、TTL 発火時に物理削除される。
   */
  public async markTemporaryAsExpired(
    userId: string,
    alertId: string,
    ttlSeconds: number
  ): Promise<void> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, alertId });
      const now = Date.now();

      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: 'SET #enabled = :enabled, #ttl = :ttl, #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#enabled': 'Enabled',
            '#ttl': 'TTL',
            '#updatedAt': 'UpdatedAt',
          },
          ExpressionAttributeValues: {
            ':enabled': false,
            ':ttl': ttlSeconds,
            ':updatedAt': now,
          },
          ConditionExpression: 'attribute_exists(PK)',
        })
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityNotFoundError('Alert', `${userId}#${alertId}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
