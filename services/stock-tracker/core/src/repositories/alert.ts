/**
 * Stock Tracker Core - Alert Repository
 *
 * アラートデータの CRUD 操作を提供
 */

import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  AbstractDynamoDBRepository,
  EntityNotFoundError,
  InvalidEntityDataError,
  validateStringField,
  validateEnumField,
  validateBooleanField,
  validateTimestampField,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { Alert } from '../types.js';
import { randomUUID } from 'crypto';

// 互換性のためのエラークラスエイリアス
export class AlertNotFoundError extends EntityNotFoundError {
  constructor(userId: string, alertId: string) {
    super('Alert', `UserID=${userId}, AlertID=${alertId}`);
    this.name = 'AlertNotFoundError';
  }
}

export class InvalidAlertDataError extends InvalidEntityDataError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAlertDataError';
  }
}

/**
 * Alert リポジトリ
 *
 * DynamoDB Single Table Design に基づくアラートデータの CRUD 操作
 */
export class AlertRepository extends AbstractDynamoDBRepository<
  Alert,
  { userId: string; alertId: string }
> {
  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    super(docClient, {
      tableName,
      entityType: 'Alert',
    });
  }

  /**
   * PK/SK を構築
   */
  protected buildKeys(key: { userId: string; alertId: string }): { PK: string; SK: string } {
    return {
      PK: `USER#${key.userId}`,
      SK: `ALERT#${key.alertId}`,
    };
  }

  /**
   * DynamoDB Item を Alert にマッピング
   */
  protected mapToEntity(item: Record<string, unknown>): Alert {
    try {
      return {
        AlertID: validateStringField(item.AlertID, 'AlertID'),
        UserID: validateStringField(item.UserID, 'UserID'),
        TickerID: validateStringField(item.TickerID, 'TickerID'),
        ExchangeID: validateStringField(item.ExchangeID, 'ExchangeID'),
        Mode: validateEnumField(item.Mode, 'Mode', ['Buy', 'Sell'] as const),
        Frequency: validateEnumField(item.Frequency, 'Frequency', [
          'MINUTE_LEVEL',
          'HOURLY_LEVEL',
        ] as const),
        Enabled: validateBooleanField(item.Enabled, 'Enabled'),
        ConditionList: this.validateConditionList(item.ConditionList),
        SubscriptionEndpoint: validateStringField(
          item.SubscriptionEndpoint,
          'SubscriptionEndpoint'
        ),
        SubscriptionKeysP256dh: validateStringField(
          item.SubscriptionKeysP256dh,
          'SubscriptionKeysP256dh'
        ),
        SubscriptionKeysAuth: validateStringField(
          item.SubscriptionKeysAuth,
          'SubscriptionKeysAuth'
        ),
        CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
        UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
      };
    } catch (error) {
      // 共通ライブラリのエラーをAlertRepositoryのエラーに変換（後方互換性のため）
      if (error instanceof InvalidEntityDataError) {
        throw new InvalidAlertDataError(error.message.replace('エンティティデータが無効です: ', ''));
      }
      throw error;
    }
  }

  /**
   * Alert を DynamoDB Item にマッピング
   */
  protected mapToItem(
    alert: Omit<Alert, 'CreatedAt' | 'UpdatedAt'>
  ): Omit<DynamoDBItem, 'CreatedAt' | 'UpdatedAt'> {
    const keys = this.buildKeys({ userId: alert.UserID, alertId: alert.AlertID });
    return {
      ...keys,
      Type: this.config.entityType,
      GSI1PK: alert.UserID,
      GSI1SK: `Alert#${alert.AlertID}`,
      GSI2PK: `ALERT#${alert.Frequency}`,
      GSI2SK: `${alert.UserID}#${alert.AlertID}`,
      AlertID: alert.AlertID,
      UserID: alert.UserID,
      TickerID: alert.TickerID,
      ExchangeID: alert.ExchangeID,
      Mode: alert.Mode,
      Frequency: alert.Frequency,
      Enabled: alert.Enabled,
      ConditionList: alert.ConditionList,
      SubscriptionEndpoint: alert.SubscriptionEndpoint,
      SubscriptionKeysP256dh: alert.SubscriptionKeysP256dh,
      SubscriptionKeysAuth: alert.SubscriptionKeysAuth,
    };
  }

  /**
   * ConditionList をバリデーション
   */
  private validateConditionList(value: unknown): Alert['ConditionList'] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new InvalidAlertDataError('フィールド "ConditionList" が不正です');
    }
    return value;
  }

  /**
   * ID でエンティティを取得（オーバーライド: エラーハンドリング追加）
   */
  async getById(key: { userId: string; alertId: string }): Promise<Alert | null>;
  async getById(userId: string, alertId: string): Promise<Alert | null>;
  async getById(
    keyOrUserId: { userId: string; alertId: string } | string,
    alertId?: string
  ): Promise<Alert | null> {
    try {
      // Normalize parameters
      const key =
        typeof keyOrUserId === 'string' && alertId !== undefined
          ? { userId: keyOrUserId, alertId }
          : (keyOrUserId as { userId: string; alertId: string });

      return await super.getById(key);
    } catch (error) {
      if (error instanceof InvalidEntityDataError) {
        throw new InvalidAlertDataError(error.message.replace('エンティティデータが無効です: ', ''));
      }
      throw error;
    }
  }

  /**
   * ユーザーのアラート一覧を取得（GSI1使用）
   *
   * @param userId - ユーザーID
   * @param limit - 取得件数制限（デフォルト: 50）
   * @param lastKey - ページネーション用の最後のキー
   * @returns アラートの配列と次のページのキー
   */
  async getByUserId(
    userId: string,
    limit = 50,
    lastKey?: Record<string, unknown>
  ): Promise<{ items: Alert[]; lastKey?: Record<string, unknown> }> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.config.tableName,
          IndexName: 'UserIndex',
          KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
          ExpressionAttributeNames: {
            '#pk': 'GSI1PK',
            '#sk': 'GSI1SK',
          },
          ExpressionAttributeValues: {
            ':pk': userId,
            ':sk': 'Alert#',
          },
          Limit: limit,
          ExclusiveStartKey: lastKey,
        })
      );

      const items = (result.Items || []).map((item) => this.mapToEntity(item));

      return {
        items,
        lastKey: result.LastEvaluatedKey,
      };
    } catch (error) {
      if (error instanceof InvalidAlertDataError) {
        throw error;
      }
      throw new Error(
        `データベースエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 頻度ごとのアラート一覧を取得（GSI2使用、バッチ処理用）
   *
   * @param frequency - 通知頻度（MINUTE_LEVEL または HOURLY_LEVEL）
   * @returns アラートの配列
   */
  async getByFrequency(frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL'): Promise<Alert[]> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.config.tableName,
          IndexName: 'AlertIndex',
          KeyConditionExpression: '#pk = :pk',
          ExpressionAttributeNames: {
            '#pk': 'GSI2PK',
          },
          ExpressionAttributeValues: {
            ':pk': `ALERT#${frequency}`,
          },
        })
      );

      if (!result.Items || result.Items.length === 0) {
        return [];
      }

      return result.Items.map((item) => this.mapToEntity(item));
    } catch (error) {
      if (error instanceof InvalidAlertDataError) {
        throw error;
      }
      throw new Error(
        `データベースエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 新しいアラートを作成
   *
   * @param alert - アラートデータ（AlertIDを除く）
   * @returns 作成されたアラート（AlertID, CreatedAt, UpdatedAtを含む）
   */
  async create(alert: Omit<Alert, 'AlertID' | 'CreatedAt' | 'UpdatedAt'>): Promise<Alert> {
    const alertId = randomUUID();
    const newAlert: Alert = {
      ...alert,
      AlertID: alertId,
      CreatedAt: Date.now(),
      UpdatedAt: Date.now(),
    };

    // AbstractDynamoDBRepositoryのcreateを呼び出す
    // AlertIDを持つnewAlertから CreatedAt/UpdatedAt を除いて渡す
    const { CreatedAt, UpdatedAt, ...alertWithoutTimestamps } = newAlert;
    return await super.create(alertWithoutTimestamps as Omit<Alert, 'CreatedAt' | 'UpdatedAt'>);
  }

  /**
   * アラートを更新
   *
   * @param userId - ユーザーID
   * @param alertId - アラートID
   * @param updates - 更新するフィールド
   * @returns 更新されたアラート
   * @throws AlertNotFoundError アラートが存在しない場合
   */
  async update(
    userId: string,
    alertId: string,
    updates: Partial<
      Pick<
        Alert,
        | 'TickerID'
        | 'ExchangeID'
        | 'Mode'
        | 'Frequency'
        | 'Enabled'
        | 'ConditionList'
        | 'SubscriptionEndpoint'
        | 'SubscriptionKeysP256dh'
        | 'SubscriptionKeysAuth'
      >
    >
  ): Promise<Alert> {
    try {
      // 存在確認（テストとの互換性のため）
      const existing = await this.getById(userId, alertId);
      if (!existing) {
        throw new AlertNotFoundError(userId, alertId);
      }

      // Frequency が更新される場合、GSI2PK も更新する必要がある
      const updatesWithGSI = { ...updates };
      if (updates.Frequency !== undefined) {
        // @ts-expect-error GSI2PK is internal field
        updatesWithGSI.GSI2PK = `ALERT#${updates.Frequency}`;
      }

      return await super.update({ userId, alertId }, updatesWithGSI as Partial<Alert>);
    } catch (error) {
      if (error instanceof AlertNotFoundError) {
        throw error;
      }
      if (error instanceof EntityNotFoundError) {
        throw new AlertNotFoundError(userId, alertId);
      }
      if (error instanceof InvalidEntityDataError) {
        throw new InvalidAlertDataError(error.message.replace('エンティティデータが無効です: ', ''));
      }
      throw error;
    }
  }

  /**
   * アラートを削除
   *
   * @param userId - ユーザーID
   * @param alertId - アラートID
   * @throws AlertNotFoundError アラートが存在しない場合
   */
  async delete(userId: string, alertId: string): Promise<void> {
    try {
      // 存在確認（テストとの互換性のため）
      const existing = await this.getById(userId, alertId);
      if (!existing) {
        throw new AlertNotFoundError(userId, alertId);
      }

      await super.delete({ userId, alertId });
    } catch (error) {
      if (error instanceof AlertNotFoundError) {
        throw error;
      }
      if (error instanceof EntityNotFoundError) {
        throw new AlertNotFoundError(userId, alertId);
      }
      throw error;
    }
  }
}
