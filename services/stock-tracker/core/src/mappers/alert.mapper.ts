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

    return {
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
      SubscriptionEndpoint: entity.SubscriptionEndpoint,
      SubscriptionKeysP256dh: entity.SubscriptionKeysP256dh,
      SubscriptionKeysAuth: entity.SubscriptionKeysAuth,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns Alert Entity
   */
  public toEntity(item: DynamoDBItem): AlertEntity {
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
      SubscriptionEndpoint: validateStringField(item.SubscriptionEndpoint, 'SubscriptionEndpoint'),
      SubscriptionKeysP256dh: validateStringField(
        item.SubscriptionKeysP256dh,
        'SubscriptionKeysP256dh'
      ),
      SubscriptionKeysAuth: validateStringField(item.SubscriptionKeysAuth, 'SubscriptionKeysAuth'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
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
}
