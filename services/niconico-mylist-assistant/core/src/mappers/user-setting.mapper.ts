/**
 * NiconicoMylistAssistant Core - UserSetting Mapper
 *
 * UserSettingEntity ↔ DynamoDBItem の変換を担当
 */

import { validateStringField, validateBooleanField } from '@nagiyu/aws';
import type { UserSettingEntity, UserSettingKey } from '../entities/user-setting.entity';

/**
 * DynamoDB Item 型 (niconico-mylist-assistant スキーマ)
 *
 * Note: プラットフォーム標準の DynamoDBItem は CreatedAt/UpdatedAt を Unix timestamp で定義しているが、
 * 本サービスは ISO 8601 文字列を使用しているため、カスタム型を使用
 */
interface UserSettingDynamoDBItem extends Record<string, unknown> {
  PK: string;
  SK: string;
  Type: string;
  userId: string;
  videoId: string;
  isFavorite: boolean;
  isSkip: boolean;
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * UserSetting Mapper
 *
 * UserSettingEntity と DynamoDB Item 間の変換を行う
 *
 * Note: EntityMapper<TEntity, TKey> インターフェースの実装は見送り
 * 理由: プラットフォーム標準の EntityMapper は CreatedAt/UpdatedAt を Unix timestamp で要求するが、
 * 本サービスは ISO 8601 文字列を使用しているため、型の互換性がない
 */
export class UserSettingMapper {
  private readonly entityType = 'USER_SETTING';

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - UserSetting Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: UserSettingEntity): Record<string, unknown> {
    const { pk, sk } = this.buildKeys({
      userId: entity.userId,
      videoId: entity.videoId,
    });

    const item: UserSettingDynamoDBItem = {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      userId: entity.userId,
      videoId: entity.videoId,
      isFavorite: entity.isFavorite,
      isSkip: entity.isSkip,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };

    if (entity.memo !== undefined) {
      item.memo = entity.memo;
    }

    return item;
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns UserSetting Entity
   */
  public toEntity(item: Record<string, unknown>): UserSettingEntity {
    const entity: UserSettingEntity = {
      userId: validateStringField(item.userId, 'userId'),
      videoId: validateStringField(item.videoId, 'videoId'),
      isFavorite: validateBooleanField(item.isFavorite, 'isFavorite'),
      isSkip: validateBooleanField(item.isSkip, 'isSkip'),
      createdAt: validateStringField(item.createdAt, 'createdAt'),
      updatedAt: validateStringField(item.updatedAt, 'updatedAt'),
    };

    if (item.memo !== undefined) {
      entity.memo = validateStringField(item.memo, 'memo');
    }

    return entity;
  }

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - UserSetting Key
   * @returns PK と SK
   */
  public buildKeys(key: UserSettingKey): { pk: string; sk: string } {
    return {
      pk: `USER#${key.userId}`,
      sk: `VIDEO#${key.videoId}`,
    };
  }
}
