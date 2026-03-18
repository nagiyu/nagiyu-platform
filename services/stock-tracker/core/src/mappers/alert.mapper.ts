/**
 * Stock Tracker Core - Alert Mapper
 *
 * AlertEntity ↔ DynamoDBItem の変換を担当
 */

import type { DynamoDBItem } from '@nagiyu/aws';
import {
  validateStringField,
  validateEnumField,
  validateBooleanField,
  validateTimestampField,
  InvalidEntityDataError,
} from '@nagiyu/aws';
import type { EntityMapper } from '@nagiyu/aws';
import type { AlertEntity, AlertKey } from '../entities/alert.entity.js';
import type { PushSubscription } from '@nagiyu/common';

/**
 * Alert Mapper
 *
 * AlertEntity と DynamoDB Item 間の変換を行う
 */
export class AlertMapper implements EntityMapper<AlertEntity, AlertKey> {
  private readonly entityType = 'Alert';

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - Alert Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: AlertEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      alertId: entity.AlertID,
    });

    const item: DynamoDBItem = {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      GSI1PK: entity.UserID,
      GSI1SK: `Alert#${entity.AlertID}`,
      GSI2PK: `ALERT#${entity.Frequency}`,
      GSI2SK: `${entity.UserID}#${entity.AlertID}`,
      AlertID: entity.AlertID,
      UserID: entity.UserID,
      TickerID: entity.TickerID,
      ExchangeID: entity.ExchangeID,
      Mode: entity.Mode,
      Frequency: entity.Frequency,
      Enabled: entity.Enabled,
      ConditionList: entity.ConditionList,
      subscription: entity.subscription,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };

    // LogicalOperator が存在する場合のみ追加
    if (entity.LogicalOperator) {
      item.LogicalOperator = entity.LogicalOperator;
    }
    if (typeof entity.NotificationTitle === 'string' && entity.NotificationTitle.length > 0) {
      item.NotificationTitle = entity.NotificationTitle;
    }
    if (typeof entity.NotificationBody === 'string' && entity.NotificationBody.length > 0) {
      item.NotificationBody = entity.NotificationBody;
    }
    if (entity.Temporary === true) {
      item.Temporary = true;
      if (entity.TemporaryExpireDate) {
        item.TemporaryExpireDate = entity.TemporaryExpireDate;
      }
    }

    return item;
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns Alert Entity
   */
  public toEntity(item: DynamoDBItem): AlertEntity {
    const entity: AlertEntity = {
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
      subscription: this.validateSubscription(item),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };

    // LogicalOperator が存在する場合のみ追加
    if (item.LogicalOperator === 'AND' || item.LogicalOperator === 'OR') {
      entity.LogicalOperator = item.LogicalOperator;
    }
    if (typeof item.NotificationTitle === 'string' && item.NotificationTitle.length > 0) {
      entity.NotificationTitle = item.NotificationTitle;
    }
    if (typeof item.NotificationBody === 'string' && item.NotificationBody.length > 0) {
      entity.NotificationBody = item.NotificationBody;
    }
    if (item.Temporary === true) {
      entity.Temporary = true;
    }
    if (typeof item.TemporaryExpireDate === 'string' && item.TemporaryExpireDate.length > 0) {
      entity.TemporaryExpireDate = item.TemporaryExpireDate;
    }

    return entity;
  }

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - Alert Key
   * @returns PK と SK
   */
  public buildKeys(key: AlertKey): { pk: string; sk: string } {
    return {
      pk: `USER#${key.userId}`,
      sk: `ALERT#${key.alertId}`,
    };
  }

  /**
   * ConditionList をバリデーション
   */
  private validateConditionList(value: unknown): AlertEntity['ConditionList'] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new InvalidEntityDataError(
        'フィールド "ConditionList" が不正です: 空でない配列である必要があります'
      );
    }
    return value;
  }

  /**
   * Alert の Web Push サブスクリプション情報を検証する。
   *
   * 移行期間中は新形式 (`subscription`) を優先し、旧形式
   * (`SubscriptionEndpoint` / `SubscriptionKeysP256dh` / `SubscriptionKeysAuth`) は
   * 後方互換のフォールバックとして読み取る。
   * 旧形式データのバックフィル完了後はフォールバック削除を想定する。
   */
  private validateSubscription(item: DynamoDBItem): PushSubscription {
    if (this.isSubscriptionRecord(item.subscription)) {
      const subscription = item.subscription;
      if (!subscription.keys || typeof subscription.keys !== 'object') {
        throw new InvalidEntityDataError(
          'フィールド "subscription.keys" が不正です: オブジェクトである必要があります'
        );
      }
      const keys = subscription.keys as Record<string, unknown>;
      return {
        endpoint: validateStringField(subscription.endpoint, 'subscription.endpoint'),
        keys: {
          p256dh: validateStringField(keys.p256dh, 'subscription.keys.p256dh'),
          auth: validateStringField(keys.auth, 'subscription.keys.auth'),
        },
      };
    }

    // 旧形式フィールドのフォールバック:
    // 「旧形式データのバックフィルタスク完了」かつ「本番テーブルで旧形式項目が残っていないことを確認」後に削除する。
    return {
      endpoint: validateStringField(item.SubscriptionEndpoint, 'SubscriptionEndpoint'),
      keys: {
        p256dh: validateStringField(item.SubscriptionKeysP256dh, 'SubscriptionKeysP256dh'),
        auth: validateStringField(item.SubscriptionKeysAuth, 'SubscriptionKeysAuth'),
      },
    };
  }

  private isSubscriptionRecord(value: unknown): value is { endpoint: unknown; keys: unknown } {
    // 新形式 `subscription` の存在判定専用の型ガード。
    // 旧形式フォールバックとの分岐に使うため、ここでは endpoint/keys の存在のみ判定し、
    // 詳細な文字列バリデーションは validateSubscription 内の validateStringField に委譲する。
    if (!value || typeof value !== 'object') {
      return false;
    }

    const record = value as Record<string, unknown>;
    return 'endpoint' in record && 'keys' in record;
  }
}
