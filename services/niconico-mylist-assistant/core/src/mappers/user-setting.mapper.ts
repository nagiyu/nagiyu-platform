/**
 * NiconicoMylistAssistant Core - UserSetting Mapper
 *
 * UserSettingEntity ↔ DynamoDBItem の変換を担当
 */

import { validateStringField, validateBooleanField } from '@nagiyu/aws';
import type { UserSettingEntity, UserSettingKey } from '../entities/user-setting.entity';

/**
 * DynamoDB Item (現在のスキーマに合わせた型定義)
 */
interface UserSettingDynamoDBItem {
  PK: string;
  SK: string;
  entityType: string;
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
 */
export class UserSettingMapper {
  private readonly entityType = 'USER_SETTING';

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - UserSetting Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: UserSettingEntity): UserSettingDynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.userId,
      videoId: entity.videoId,
    });

    const item: UserSettingDynamoDBItem = {
      PK: pk,
      SK: sk,
      entityType: this.entityType,
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
  public toEntity(item: UserSettingDynamoDBItem): UserSettingEntity {
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
