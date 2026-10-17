/**
 * NiconicoMylistAssistant Core - UserSetting Mapper
 *
 * UserSettingEntity ↔ DynamoDB Item の変換を担当
 */

import {
  immutablePatchValue,
  optionalPatchValue,
  readAttribute,
  readTimestamp,
  requiredPatchValue,
  validateBooleanField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { UserSettingEntity, UserSettingKey } from '../entities/user-setting.entity.js';

/**
 * UserSetting Mapper
 *
 * UserSettingEntity と DynamoDB Item 間の変換を行う。
 * 保存する属性名は PascalCase (頭字語は大文字のまま) で、旧データの camelCase の属性名も読める。
 */
export class UserSettingMapper implements EntityMapper<UserSettingEntity, UserSettingKey> {
  public readonly entityType = 'USER_SETTING';

  public readonly legacyAttributeNames = {
    UserID: ['userId'],
    VideoID: ['videoId'],
    IsFavorite: ['isFavorite'],
    IsSkip: ['isSkip'],
    Memo: ['memo'],
  } as const;

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - UserSetting Key
   * @returns DynamoDB の Key
   */
  public buildKeys(key: UserSettingKey): DynamoDBKey {
    return {
      PK: `USER#${key.userId}`,
      SK: `VIDEO#${key.videoId}`,
    };
  }

  public getKey(entity: UserSettingEntity): UserSettingKey {
    return { userId: entity.userId, videoId: entity.videoId };
  }

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - UserSetting Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: UserSettingEntity): DynamoDBAttributes {
    const item: DynamoDBAttributes = {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      VideoID: entity.videoId,
      IsFavorite: entity.isFavorite,
      IsSkip: entity.isSkip,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };

    if (entity.memo !== undefined) {
      item.Memo = entity.memo;
    }

    return item;
  }

  /**
   * Entity の部分を保存用の属性に変換
   *
   * userId・videoId・createdAt は作成後に変えられないため、含めると拒否する。
   *
   * @param changes - 変更する項目 (undefined は変更なし、null は属性削除)
   * @returns 保存用の属性
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<UserSettingEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      VideoID: immutablePatchValue(changes.videoId, 'VideoID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      IsFavorite: requiredPatchValue(changes.isFavorite, 'IsFavorite'),
      IsSkip: requiredPatchValue(changes.isSkip, 'IsSkip'),
      Memo: optionalPatchValue(changes.memo),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * 新しい属性名を優先し、なければ旧名を読む。
   *
   * @param item - DynamoDB Item
   * @returns UserSetting Entity
   */
  public toEntity(item: DynamoDBAttributes): UserSettingEntity {
    const legacy = this.legacyAttributeNames;
    const entity: UserSettingEntity = {
      userId: validateStringField(readAttribute(item, 'UserID', legacy.UserID), 'UserID'),
      videoId: validateStringField(readAttribute(item, 'VideoID', legacy.VideoID), 'VideoID'),
      isFavorite: validateBooleanField(
        readAttribute(item, 'IsFavorite', legacy.IsFavorite),
        'IsFavorite'
      ),
      isSkip: validateBooleanField(readAttribute(item, 'IsSkip', legacy.IsSkip), 'IsSkip'),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
    };

    const memo = readAttribute(item, 'Memo', legacy.Memo);
    if (memo !== undefined) {
      entity.memo = validateStringField(memo, 'Memo', { allowEmpty: true });
    }

    return entity;
  }
}
