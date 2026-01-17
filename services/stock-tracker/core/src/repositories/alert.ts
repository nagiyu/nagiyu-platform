/**
 * Stock Tracker Core - Alert Repository
 *
 * アラートデータの CRUD 操作を提供
 */

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Alert, DynamoDBItem } from '../types.js';
import { randomUUID } from 'crypto';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  ALERT_NOT_FOUND: 'アラートが見つかりません',
  INVALID_ALERT_DATA: 'アラートデータが無効です',
  DATABASE_ERROR: 'データベースエラーが発生しました',
} as const;

// カスタムエラークラス
export class AlertNotFoundError extends Error {
  constructor(userId: string, alertId: string) {
    super(`${ERROR_MESSAGES.ALERT_NOT_FOUND}: UserID=${userId}, AlertID=${alertId}`);
    this.name = 'AlertNotFoundError';
  }
}

export class InvalidAlertDataError extends Error {
  constructor(message: string) {
    super(`${ERROR_MESSAGES.INVALID_ALERT_DATA}: ${message}`);
    this.name = 'InvalidAlertDataError';
  }
}

/**
 * Alert リポジトリ
 *
 * DynamoDB Single Table Design に基づくアラートデータの CRUD 操作
 */
export class AlertRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
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
          TableName: this.tableName,
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

      const items = (result.Items || []).map((item) => this.mapDynamoDBItemToAlert(item));

      return {
        items,
        lastKey: result.LastEvaluatedKey,
      };
    } catch (error) {
      if (error instanceof InvalidAlertDataError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
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
          TableName: this.tableName,
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

      return result.Items.map((item) => this.mapDynamoDBItemToAlert(item));
    } catch (error) {
      if (error instanceof InvalidAlertDataError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * アラートIDで単一のアラートを取得
   *
   * @param userId - ユーザーID
   * @param alertId - アラートID
   * @returns アラート（存在しない場合はnull）
   */
  async getById(userId: string, alertId: string): Promise<Alert | null> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: `USER#${userId}`,
            SK: `ALERT#${alertId}`,
          },
        })
      );

      if (!result.Item) {
        return null;
      }

      return this.mapDynamoDBItemToAlert(result.Item);
    } catch (error) {
      if (error instanceof InvalidAlertDataError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 新しいアラートを作成
   *
   * @param alert - アラートデータ（AlertIDを除く）
   * @returns 作成されたアラート（AlertID, CreatedAt, UpdatedAtを含む）
   */
  async create(
    alert: Omit<Alert, 'AlertID' | 'CreatedAt' | 'UpdatedAt'>
  ): Promise<Alert> {
    try {
      const now = Date.now();
      const alertId = randomUUID();
      const newAlert: Alert = {
        ...alert,
        AlertID: alertId,
        CreatedAt: now,
        UpdatedAt: now,
      };

      const item: DynamoDBItem & Alert = {
        PK: `USER#${newAlert.UserID}`,
        SK: `ALERT#${newAlert.AlertID}`,
        Type: 'Alert',
        GSI1PK: newAlert.UserID,
        GSI1SK: `Alert#${newAlert.AlertID}`,
        GSI2PK: `ALERT#${newAlert.Frequency}`,
        GSI2SK: `${newAlert.UserID}#${newAlert.AlertID}`,
        ...newAlert,
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
        })
      );

      return newAlert;
    } catch (error) {
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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
      // 存在確認
      const existing = await this.getById(userId, alertId);
      if (!existing) {
        throw new AlertNotFoundError(userId, alertId);
      }

      // 更新可能なフィールドのみ抽出
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

        // GSI2PKも更新する必要がある
        updateExpressions.push('#gsi2pk = :gsi2pk');
        expressionAttributeNames['#gsi2pk'] = 'GSI2PK';
        expressionAttributeValues[':gsi2pk'] = `ALERT#${updates.Frequency}`;
      }

      if (updates.Enabled !== undefined) {
        updateExpressions.push('#enabled = :enabled');
        expressionAttributeNames['#enabled'] = 'Enabled';
        expressionAttributeValues[':enabled'] = updates.Enabled;
      }

      if (updates.ConditionList !== undefined) {
        updateExpressions.push('#conditionList = :conditionList');
        expressionAttributeNames['#conditionList'] = 'ConditionList';
        expressionAttributeValues[':conditionList'] = updates.ConditionList;
      }

      if (updates.SubscriptionEndpoint !== undefined) {
        updateExpressions.push('#subscriptionEndpoint = :subscriptionEndpoint');
        expressionAttributeNames['#subscriptionEndpoint'] = 'SubscriptionEndpoint';
        expressionAttributeValues[':subscriptionEndpoint'] = updates.SubscriptionEndpoint;
      }

      if (updates.SubscriptionKeysP256dh !== undefined) {
        updateExpressions.push('#subscriptionKeysP256dh = :subscriptionKeysP256dh');
        expressionAttributeNames['#subscriptionKeysP256dh'] = 'SubscriptionKeysP256dh';
        expressionAttributeValues[':subscriptionKeysP256dh'] = updates.SubscriptionKeysP256dh;
      }

      if (updates.SubscriptionKeysAuth !== undefined) {
        updateExpressions.push('#subscriptionKeysAuth = :subscriptionKeysAuth');
        expressionAttributeNames['#subscriptionKeysAuth'] = 'SubscriptionKeysAuth';
        expressionAttributeValues[':subscriptionKeysAuth'] = updates.SubscriptionKeysAuth;
      }

      // UpdatedAt を自動更新
      const now = Date.now();
      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
      expressionAttributeValues[':updatedAt'] = now;

      const ONLY_UPDATED_AT_FIELD = 1;
      if (updateExpressions.length === ONLY_UPDATED_AT_FIELD) {
        // UpdatedAt のみの更新（他のフィールドが指定されていない）
        throw new InvalidAlertDataError('更新するフィールドが指定されていません');
      }

      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            PK: `USER#${userId}`,
            SK: `ALERT#${alertId}`,
          },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression: 'attribute_exists(PK)',
        })
      );

      // 更新後のデータを取得して返す
      const updated = await this.getById(userId, alertId);
      if (!updated) {
        throw new AlertNotFoundError(userId, alertId);
      }

      return updated;
    } catch (error) {
      if (error instanceof AlertNotFoundError || error instanceof InvalidAlertDataError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
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
      // 存在確認
      const existing = await this.getById(userId, alertId);
      if (!existing) {
        throw new AlertNotFoundError(userId, alertId);
      }

      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: {
            PK: `USER#${userId}`,
            SK: `ALERT#${alertId}`,
          },
          ConditionExpression: 'attribute_exists(PK)',
        })
      );
    } catch (error) {
      if (error instanceof AlertNotFoundError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * DynamoDB Item を Alert にマッピング
   *
   * @param item - DynamoDB Item
   * @returns Alert
   */
  private mapDynamoDBItemToAlert(item: Record<string, unknown>): Alert {
    // フィールドのバリデーション
    const alertId = item.AlertID;
    if (typeof alertId !== 'string' || alertId.length === 0) {
      throw new InvalidAlertDataError('フィールド "AlertID" が不正です');
    }

    const userId = item.UserID;
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new InvalidAlertDataError('フィールド "UserID" が不正です');
    }

    const tickerId = item.TickerID;
    if (typeof tickerId !== 'string' || tickerId.length === 0) {
      throw new InvalidAlertDataError('フィールド "TickerID" が不正です');
    }

    const exchangeId = item.ExchangeID;
    if (typeof exchangeId !== 'string' || exchangeId.length === 0) {
      throw new InvalidAlertDataError('フィールド "ExchangeID" が不正です');
    }

    const mode = item.Mode;
    if (mode !== 'Buy' && mode !== 'Sell') {
      throw new InvalidAlertDataError('フィールド "Mode" が不正です');
    }

    const frequency = item.Frequency;
    if (frequency !== 'MINUTE_LEVEL' && frequency !== 'HOURLY_LEVEL') {
      throw new InvalidAlertDataError('フィールド "Frequency" が不正です');
    }

    const enabled = item.Enabled;
    if (typeof enabled !== 'boolean') {
      throw new InvalidAlertDataError('フィールド "Enabled" が不正です');
    }

    const conditionList = item.ConditionList;
    if (!Array.isArray(conditionList) || conditionList.length === 0) {
      throw new InvalidAlertDataError('フィールド "ConditionList" が不正です');
    }

    const subscriptionEndpoint = item.SubscriptionEndpoint;
    if (typeof subscriptionEndpoint !== 'string' || subscriptionEndpoint.length === 0) {
      throw new InvalidAlertDataError('フィールド "SubscriptionEndpoint" が不正です');
    }

    const subscriptionKeysP256dh = item.SubscriptionKeysP256dh;
    if (typeof subscriptionKeysP256dh !== 'string' || subscriptionKeysP256dh.length === 0) {
      throw new InvalidAlertDataError('フィールド "SubscriptionKeysP256dh" が不正です');
    }

    const subscriptionKeysAuth = item.SubscriptionKeysAuth;
    if (typeof subscriptionKeysAuth !== 'string' || subscriptionKeysAuth.length === 0) {
      throw new InvalidAlertDataError('フィールド "SubscriptionKeysAuth" が不正です');
    }

    const createdAt = item.CreatedAt;
    if (typeof createdAt !== 'number') {
      throw new InvalidAlertDataError('フィールド "CreatedAt" が不正です');
    }

    const updatedAt = item.UpdatedAt;
    if (typeof updatedAt !== 'number') {
      throw new InvalidAlertDataError('フィールド "UpdatedAt" が不正です');
    }

    const alert: Alert = {
      AlertID: alertId,
      UserID: userId,
      TickerID: tickerId,
      ExchangeID: exchangeId,
      Mode: mode,
      Frequency: frequency,
      Enabled: enabled,
      ConditionList: conditionList,
      SubscriptionEndpoint: subscriptionEndpoint,
      SubscriptionKeysP256dh: subscriptionKeysP256dh,
      SubscriptionKeysAuth: subscriptionKeysAuth,
      CreatedAt: createdAt,
      UpdatedAt: updatedAt,
    };
    return alert;
  }
}
