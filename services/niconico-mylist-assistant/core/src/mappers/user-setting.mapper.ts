/**
 * NiconicoMylistAssistant Core - UserSetting Mapper
 *
 * UserSettingEntity ↔ DynamoDBItem の変換を担当
 */

import type { DynamoDBItem, EntityMapper } from '@nagiyu/aws';
import { validateStringField, validateBooleanField, validateTimestampField } from '@nagiyu/aws';
import type { UserSettingEntity, UserSettingKey } from '../entities/user-setting.entity';

/**
 * UserSetting Mapper
 *
 * UserSettingEntity と DynamoDB Item 間の変換を行う
 */
export class UserSettingMapper implements EntityMapper<UserSettingEntity, UserSettingKey> {
  private readonly entityType = 'USER_SETTING';

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - UserSetting Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: UserSettingEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.userId,
      videoId: entity.videoId,
    });

    const item: DynamoDBItem = {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      userId: entity.userId,
      videoId: entity.videoId,
      isFavorite: entity.isFavorite,
      isSkip: entity.isSkip,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
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
  public toEntity(item: DynamoDBItem): UserSettingEntity {
    const entity: UserSettingEntity = {
      userId: validateStringField(item.userId, 'userId'),
      videoId: validateStringField(item.videoId, 'videoId'),
      isFavorite: validateBooleanField(item.isFavorite, 'isFavorite'),
      isSkip: validateBooleanField(item.isSkip, 'isSkip'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
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
