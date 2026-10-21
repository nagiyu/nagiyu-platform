/**
 * Stock Tracker Core - Alert Mapper
 *
 * AlertEntity ↔ DynamoDB Item の変換を担当
 */

import {
  InvalidEntityDataError,
  TTL_ATTRIBUTE_NAME,
  immutablePatchValue,
  optionalPatchValue,
  readAttribute,
  readOptionalTimestamp,
  readTimestamp,
  requiredPatchValue,
  toTtlSeconds,
  validateBooleanField,
  validateEnumField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import { toErrorMessage, type PushSubscription } from '@nagiyu/common';
import type { AlertEntity, AlertKey } from '../entities/alert.entity.js';
import type { AlertAuditResult } from '../repositories/alert.repository.interface.js';
import type { TemporaryAlertCandidate } from '../entities/temporary-alert-candidate.entity.js';

/** アラートアイテムの GSI1SK の接頭辞 */
export const ALERT_GSI1_SK_PREFIX = 'Alert#';

/** アラートアイテムの GSI2PK の接頭辞 */
export const ALERT_GSI2_PK_PREFIX = 'ALERT#';

/**
 * ユーザー ID からアラートアイテムの GSI1PK を構築する
 *
 * アラートはユーザーごとに一覧するため、ユーザー ID がそのままパーティションキーになる。
 *
 * @param userId - ユーザーID
 * @returns GSI1PK
 */
export function buildAlertGsi1Pk(userId: string): string {
  return userId;
}

/**
 * アラート ID からアラートアイテムの GSI1SK を構築する
 *
 * @param alertId - アラートID
 * @returns GSI1SK
 */
export function buildAlertGsi1Sk(alertId: string): string {
  return `${ALERT_GSI1_SK_PREFIX}${alertId}`;
}

/**
 * 通知頻度からアラートアイテムの GSI2PK を構築する
 *
 * バッチが頻度ごとに全アラートを取得するためのパーティションキー。
 *
 * @param frequency - 通知頻度
 * @returns GSI2PK
 */
export function buildAlertGsi2Pk(frequency: AlertEntity['frequency']): string {
  return `${ALERT_GSI2_PK_PREFIX}${frequency}`;
}

/**
 * GSI2 のソートキーを構築する
 *
 * ユーザー ID の昇順、同一ユーザー内はアラート ID の昇順で並ぶ。
 *
 * @param userId - ユーザーID
 * @param alertId - アラートID
 * @returns GSI2SK
 */
export function buildAlertGsi2Sk(userId: string, alertId: string): string {
  return `${userId}#${alertId}`;
}

const FREQUENCIES = ['MINUTE_LEVEL', 'HOURLY_LEVEL'] as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** サブスクリプションの保存属性名。旧データは小文字始まりの `subscription` で保存されている */
const SUBSCRIPTION_ATTRIBUTE = 'Subscription';
const LEGACY_SUBSCRIPTION_ATTRIBUTE = 'subscription';

/**
 * Alert Mapper
 *
 * AlertEntity と DynamoDB Item 間の変換を行う
 */
export class AlertMapper implements EntityMapper<AlertEntity, AlertKey> {
  public readonly entityType = 'Alert';

  public readonly legacyAttributeNames = {
    [SUBSCRIPTION_ATTRIBUTE]: [LEGACY_SUBSCRIPTION_ATTRIBUTE],
  } as const;

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - Alert Key
   * @returns DynamoDB の Key
   */
  public buildKeys(key: AlertKey): DynamoDBKey {
    return {
      PK: `USER#${key.userId}`,
      SK: `ALERT#${key.alertId}`,
    };
  }

  public getKey(entity: AlertEntity): AlertKey {
    return { userId: entity.userId, alertId: entity.alertId };
  }

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - Alert Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: AlertEntity): DynamoDBAttributes {
    const item: DynamoDBAttributes = {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      GSI1PK: buildAlertGsi1Pk(entity.userId),
      GSI1SK: buildAlertGsi1Sk(entity.alertId),
      GSI2PK: buildAlertGsi2Pk(entity.frequency),
      GSI2SK: buildAlertGsi2Sk(entity.userId, entity.alertId),
      AlertID: entity.alertId,
      UserID: entity.userId,
      TickerID: entity.tickerId,
      ExchangeID: entity.exchangeId,
      Mode: entity.mode,
      Frequency: entity.frequency,
      Enabled: entity.enabled,
      ConditionList: entity.conditionList,
      [SUBSCRIPTION_ATTRIBUTE]: entity.subscription,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };

    if (entity.logicalOperator) {
      item.LogicalOperator = entity.logicalOperator;
    }
    if (typeof entity.customMessage === 'string' && entity.customMessage.length > 0) {
      item.CustomMessage = entity.customMessage;
    }
    if (entity.temporary === true) {
      item.Temporary = true;
      if (entity.temporaryExpireDate) {
        item.TemporaryExpireDate = entity.temporaryExpireDate;
      }
    }
    if (entity.expiresAt !== undefined) {
      item[TTL_ATTRIBUTE_NAME] = toTtlSeconds(entity.expiresAt);
    }

    return item;
  }

  /**
   * Entity の部分を保存用の属性に変換
   *
   * alertId・userId・tickerId・exchangeId・createdAt は作成後に変えられないため、含めると拒否する。
   * GSI1 と GSI2SK は更新のたびに `key` から付け直す。GSI2PK は frequency から作られるため、
   * frequency を変えるときだけ付け直す。
   *
   * @param changes - 変更する項目 (undefined は変更なし、null は属性削除)
   * @param key - 更新対象のビジネスキー
   * @returns 保存用の属性
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<AlertEntity>, key: AlertKey): DynamoDBAttributes {
    const frequency = requiredPatchValue(changes.frequency, 'Frequency');
    return {
      AlertID: immutablePatchValue(changes.alertId, 'AlertID'),
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      TickerID: immutablePatchValue(changes.tickerId, 'TickerID'),
      ExchangeID: immutablePatchValue(changes.exchangeId, 'ExchangeID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      GSI1PK: buildAlertGsi1Pk(key.userId),
      GSI1SK: buildAlertGsi1Sk(key.alertId),
      GSI2PK: frequency === undefined ? undefined : buildAlertGsi2Pk(frequency),
      GSI2SK: buildAlertGsi2Sk(key.userId, key.alertId),
      Mode: requiredPatchValue(changes.mode, 'Mode'),
      Frequency: frequency,
      Enabled: requiredPatchValue(changes.enabled, 'Enabled'),
      ConditionList: requiredPatchValue(changes.conditionList, 'ConditionList'),
      [SUBSCRIPTION_ATTRIBUTE]: requiredPatchValue(changes.subscription, 'Subscription'),
      Temporary: optionalPatchValue(changes.temporary),
      TemporaryExpireDate: optionalPatchValue(changes.temporaryExpireDate),
      LogicalOperator: optionalPatchValue(changes.logicalOperator),
      CustomMessage: optionalPatchValue(changes.customMessage),
      [TTL_ATTRIBUTE_NAME]:
        typeof changes.expiresAt === 'number'
          ? toTtlSeconds(changes.expiresAt)
          : optionalPatchValue(changes.expiresAt),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * サブスクリプションは旧属性名 `subscription` と、それより前の平坦な形式も読める。
   *
   * @param item - DynamoDB Item
   * @returns Alert Entity
   */
  public toEntity(item: DynamoDBAttributes): AlertEntity {
    const entity: AlertEntity = {
      alertId: validateStringField(item.AlertID, 'AlertID'),
      userId: validateStringField(item.UserID, 'UserID'),
      tickerId: validateStringField(item.TickerID, 'TickerID'),
      exchangeId: validateStringField(item.ExchangeID, 'ExchangeID'),
      mode: validateEnumField(item.Mode, 'Mode', ['Buy', 'Sell'] as const),
      frequency: validateEnumField(item.Frequency, 'Frequency', FREQUENCIES),
      enabled: validateBooleanField(item.Enabled, 'Enabled'),
      conditionList: this.validateConditionList(item.ConditionList),
      subscription: this.validateSubscription(item),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
    };

    if (item.LogicalOperator === 'AND' || item.LogicalOperator === 'OR') {
      entity.logicalOperator = item.LogicalOperator;
    }
    if (typeof item.CustomMessage === 'string' && item.CustomMessage.length > 0) {
      entity.customMessage = item.CustomMessage;
    }
    if (item.Temporary === true) {
      entity.temporary = true;
    }
    if (typeof item.TemporaryExpireDate === 'string' && item.TemporaryExpireDate.length > 0) {
      entity.temporaryExpireDate = item.TemporaryExpireDate;
    }
    const expiresAt = readOptionalTimestamp(item, TTL_ATTRIBUTE_NAME);
    if (expiresAt !== undefined) {
      entity.expiresAt = expiresAt;
    }

    return entity;
  }

  /**
   * DynamoDB Item の一覧を、読めたアラートと読めなかったアイテムに分ける。
   *
   * 読めないアイテムを捨てずに返すのは、購読の点検で壊れたアラートを見つけるため。
   * 読めない理由はアイテム単位の検証失敗に限られるため、エラーの種類を問わず
   * 読めなかったアイテムとして扱う。
   *
   * @param items - DynamoDB Item の一覧
   * @returns 読めたアラートと、読めなかったアイテム
   */
  public splitReadable(items: DynamoDBAttributes[]): AlertAuditResult {
    const result: AlertAuditResult = { alerts: [], unreadable: [] };
    for (const item of items) {
      try {
        result.alerts.push(this.toEntity(item));
      } catch (error) {
        result.unreadable.push({
          ...(isNonEmptyString(item.UserID) ? { userId: item.UserID } : {}),
          ...(isNonEmptyString(item.AlertID) ? { alertId: item.AlertID } : {}),
          ...(typeof item.PK === 'string' ? { pk: item.PK } : {}),
          ...(typeof item.SK === 'string' ? { sk: item.SK } : {}),
          reason: toErrorMessage(error),
        });
      }
    }
    return result;
  }

  /**
   * DynamoDB Item を一時アラート失効バッチ用の軽量候補オブジェクトに変換する。
   *
   * 失効判定に必要な属性のみを検証し、subscription / conditionList 等の
   * 通知送信時にだけ必要なフィールドは一切参照しない。これにより、
   * subscription データの整合性に関係なくバッチが安全に動作する。
   *
   * @param item - DynamoDB Item（ProjectionExpression で属性が絞られていてもよい）
   * @returns 一時アラート失効判定用の軽量エンティティ
   */
  public toTemporaryCandidate(item: DynamoDBAttributes): TemporaryAlertCandidate {
    return {
      alertId: validateStringField(item.AlertID, 'AlertID'),
      userId: validateStringField(item.UserID, 'UserID'),
      exchangeId: validateStringField(item.ExchangeID, 'ExchangeID'),
      frequency: validateEnumField(item.Frequency, 'Frequency', FREQUENCIES),
      enabled: validateBooleanField(item.Enabled, 'Enabled'),
      temporary: item.Temporary === true,
      temporaryExpireDate: validateStringField(item.TemporaryExpireDate, 'TemporaryExpireDate'),
    };
  }

  /**
   * ConditionList をバリデーション
   */
  private validateConditionList(value: unknown): AlertEntity['conditionList'] {
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
   * 新名 `Subscription` を優先し、旧データの `subscription` も読む。さらに古いデータは
   * 平坦な属性 (`SubscriptionEndpoint` / `SubscriptionKeysP256dh` / `SubscriptionKeysAuth`) で
   * 保存されているため、それも読む。書き込みは新形式のみで、書き込まれないアイテムは
   * 旧形式のまま残るため、読み取りの互換処理は残し続ける。
   */
  private validateSubscription(item: DynamoDBAttributes): PushSubscription {
    const stored = readAttribute(item, SUBSCRIPTION_ATTRIBUTE, [LEGACY_SUBSCRIPTION_ATTRIBUTE]);
    if (this.isSubscriptionRecord(stored)) {
      if (!stored.keys || typeof stored.keys !== 'object') {
        throw new InvalidEntityDataError(
          'フィールド "Subscription.keys" が不正です: オブジェクトである必要があります'
        );
      }
      const keys = stored.keys as Record<string, unknown>;
      return {
        endpoint: validateStringField(stored.endpoint, 'Subscription.endpoint'),
        keys: {
          p256dh: validateStringField(keys.p256dh, 'Subscription.keys.p256dh'),
          auth: validateStringField(keys.auth, 'Subscription.keys.auth'),
        },
      };
    }

    // 平坦な旧形式。一括移行をしないため、旧形式のまま残るアイテムを読めるようにここで受ける。
    return {
      endpoint: validateStringField(item.SubscriptionEndpoint, 'SubscriptionEndpoint'),
      keys: {
        p256dh: validateStringField(item.SubscriptionKeysP256dh, 'SubscriptionKeysP256dh'),
        auth: validateStringField(item.SubscriptionKeysAuth, 'SubscriptionKeysAuth'),
      },
    };
  }

  private isSubscriptionRecord(value: unknown): value is { endpoint: unknown; keys: unknown } {
    // 入れ子形式の存在判定専用の型ガード。
    // 平坦な旧形式フォールバックとの分岐に使うため、ここでは endpoint/keys の存在のみ判定し、
    // 詳細な文字列バリデーションは validateSubscription 内の validateStringField に委譲する。
    if (!value || typeof value !== 'object') {
      return false;
    }

    const record = value as Record<string, unknown>;
    return 'endpoint' in record && 'keys' in record;
  }
}
