import crypto from 'node:crypto';
import {
  InvalidEntityDataError,
  immutablePatchValue,
  readAttribute,
  readTimestamp,
  requiredPatchValue,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import { toErrorMessage } from '@nagiyu/common';
import type { PushSubscriptionRecord } from './subscription-types.js';

const ERROR_MESSAGES = {
  INVALID_ENDPOINT: 'endpoint は空文字にできません',
  INVALID_SUBSCRIPTION_ID: 'subscriptionId は空文字にできません',
  INVALID_USER_ID: 'userId は空文字にできません',
  INVALID_P256DH_KEY: 'p256dhKey は空文字にできません',
  INVALID_AUTH_KEY: 'authKey は空文字にできません',
  INVALID_PARTITION_KEY: 'PK が購読のキーの形式ではありません',
} as const;

const SUBSCRIPTION_PREFIX = 'SUBSCRIPTION#';
const USER_PREFIX = 'USER#';
const ENDPOINT_PREFIX = 'ENDPOINT#';

/** Type 属性の値。Scan で購読だけを絞るために repository からも使う */
export const SUBSCRIPTION_ENTITY_TYPE = 'Subscription';

/** endpoint から引く GSI の名前 */
export const ENDPOINT_INDEX_NAME = 'EndpointIndex';

/** 購読のビジネスキー */
export type PushSubscriptionKey = { subscriptionId: string };

/** 読めなかった Item の情報。ログに出して原因を追えるようにする */
export type UnreadableSubscriptionItem = {
  pk?: string;
  reason: string;
};

/**
 * Endpoint URL から GSI2PK 用のハッシュ値を生成する。
 *
 * DynamoDB のパーティションキー長制限を超えないように、
 * Endpoint URL は SHA-256 の固定長ハッシュへ変換して保存する。
 *
 * @throws InvalidEntityDataError endpoint が空文字のとき
 */
function hashEndpoint(endpoint: string): string {
  if (endpoint.length === 0) {
    throw new InvalidEntityDataError(ERROR_MESSAGES.INVALID_ENDPOINT);
  }

  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

/**
 * endpoint から EndpointIndex の GSI2PK を構築する。
 *
 * @throws InvalidEntityDataError endpoint が空文字のとき
 */
export function buildEndpointGsi2Pk(endpoint: string): string {
  return `${ENDPOINT_PREFIX}${hashEndpoint(endpoint)}`;
}

function buildUserGsi1Pk(userId: string): string {
  return `${USER_PREFIX}${userId}`;
}

function buildGsi1Sk(subscriptionId: string): string {
  return `${SUBSCRIPTION_PREFIX}${subscriptionId}`;
}

/** 新属性名 → 旧属性名。旧データは小文字始まりで、時刻が ISO 文字列 */
const LEGACY_NAMES = {
  SubscriptionID: ['subscriptionId'],
  UserID: ['userId'],
  Endpoint: ['endpoint'],
  P256dhKey: ['p256dhKey'],
  AuthKey: ['authKey'],
  CreatedAt: ['createdAt'],
  UpdatedAt: ['updatedAt'],
} as const;

type StringAttributeName = 'SubscriptionID' | 'UserID' | 'Endpoint' | 'P256dhKey' | 'AuthKey';

function readString(item: DynamoDBAttributes, name: StringAttributeName): string {
  return validateStringField(readAttribute(item, name, LEGACY_NAMES[name]), name);
}

/**
 * Web Push 購読の Mapper。
 *
 * 一括移行をしないので、書き込まれないアイテムは旧形式のまま残り続ける。
 * そのため読み取りは旧属性名と ISO 文字列の時刻も受け付ける。
 */
export class PushSubscriptionMapper implements EntityMapper<
  PushSubscriptionRecord,
  PushSubscriptionKey
> {
  public readonly entityType = SUBSCRIPTION_ENTITY_TYPE;

  public readonly legacyAttributeNames = LEGACY_NAMES;

  public buildKeys(key: PushSubscriptionKey): DynamoDBKey {
    return {
      PK: `${SUBSCRIPTION_PREFIX}${key.subscriptionId}`,
      SK: `${SUBSCRIPTION_PREFIX}${key.subscriptionId}`,
    };
  }

  public getKey(entity: PushSubscriptionRecord): PushSubscriptionKey {
    return { subscriptionId: entity.subscriptionId };
  }

  /**
   * Item の PK から購読のキーを取り出す。
   *
   * 本体の属性が壊れていても削除できるよう、属性ではなくキーから復元する。
   *
   * @throws InvalidEntityDataError PK が購読のキーの形式でないとき
   */
  public keyFromItem(item: DynamoDBAttributes): PushSubscriptionKey {
    const pk = item.PK;
    if (typeof pk !== 'string' || !pk.startsWith(SUBSCRIPTION_PREFIX)) {
      throw new InvalidEntityDataError(ERROR_MESSAGES.INVALID_PARTITION_KEY);
    }
    return { subscriptionId: pk.slice(SUBSCRIPTION_PREFIX.length) };
  }

  /**
   * @throws InvalidEntityDataError 必須項目が空文字のとき
   */
  public toItem(entity: PushSubscriptionRecord): DynamoDBAttributes {
    if (!entity.subscriptionId) {
      throw new InvalidEntityDataError(ERROR_MESSAGES.INVALID_SUBSCRIPTION_ID);
    }
    if (!entity.userId) {
      throw new InvalidEntityDataError(ERROR_MESSAGES.INVALID_USER_ID);
    }
    if (!entity.subscription.keys.p256dh) {
      throw new InvalidEntityDataError(ERROR_MESSAGES.INVALID_P256DH_KEY);
    }
    if (!entity.subscription.keys.auth) {
      throw new InvalidEntityDataError(ERROR_MESSAGES.INVALID_AUTH_KEY);
    }

    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      GSI1PK: buildUserGsi1Pk(entity.userId),
      GSI1SK: buildGsi1Sk(entity.subscriptionId),
      GSI2PK: buildEndpointGsi2Pk(entity.subscription.endpoint),
      SubscriptionID: entity.subscriptionId,
      UserID: entity.userId,
      Endpoint: entity.subscription.endpoint,
      P256dhKey: entity.subscription.keys.p256dh,
      AuthKey: entity.subscription.keys.auth,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };
  }

  /**
   * GSI1PK は userId、GSI2PK は endpoint から作るため、それぞれ変えるときだけ付け直す。
   * GSI1SK は更新対象のキーから作る。
   *
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(
    changes: EntityPatch<PushSubscriptionRecord>,
    key: PushSubscriptionKey
  ): DynamoDBAttributes {
    const userId = requiredPatchValue(changes.userId, 'UserID');
    const subscription = requiredPatchValue(changes.subscription, 'Subscription');
    return {
      SubscriptionID: immutablePatchValue(changes.subscriptionId, 'SubscriptionID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      GSI1SK: buildGsi1Sk(key.subscriptionId),
      UserID: userId,
      GSI1PK: userId === undefined ? undefined : buildUserGsi1Pk(userId),
      Endpoint: subscription?.endpoint,
      P256dhKey: subscription?.keys.p256dh,
      AuthKey: subscription?.keys.auth,
      GSI2PK: subscription === undefined ? undefined : buildEndpointGsi2Pk(subscription.endpoint),
    };
  }

  /**
   * 旧属性名と ISO 文字列の時刻も読む。新旧が併存するときは新名を優先する。
   *
   * @throws InvalidEntityDataError 読めないデータのとき
   */
  public toEntity(item: DynamoDBAttributes): PushSubscriptionRecord {
    return {
      subscriptionId: readString(item, 'SubscriptionID'),
      userId: readString(item, 'UserID'),
      subscription: {
        endpoint: readString(item, 'Endpoint'),
        keys: {
          p256dh: readString(item, 'P256dhKey'),
          auth: readString(item, 'AuthKey'),
        },
      },
      createdAt: readTimestamp(item, 'CreatedAt', LEGACY_NAMES.CreatedAt),
      updatedAt: readTimestamp(item, 'UpdatedAt', LEGACY_NAMES.UpdatedAt),
    };
  }

  /**
   * Item の一覧を、読めた購読と読めなかった Item に分ける。
   *
   * 1 件の破損で全購読の配信を止めないために、例外にせず呼び出し側へ返す。
   */
  public splitReadable(items: DynamoDBAttributes[]): {
    records: PushSubscriptionRecord[];
    unreadable: UnreadableSubscriptionItem[];
  } {
    const records: PushSubscriptionRecord[] = [];
    const unreadable: UnreadableSubscriptionItem[] = [];
    for (const item of items) {
      try {
        records.push(this.toEntity(item));
      } catch (error) {
        unreadable.push({
          ...(typeof item.PK === 'string' ? { pk: item.PK } : {}),
          reason: toErrorMessage(error),
        });
      }
    }
    return { records, unreadable };
  }
}
