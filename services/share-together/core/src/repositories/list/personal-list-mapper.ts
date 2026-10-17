import {
  immutablePatchValue,
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
import type { PersonalList } from '../../types/index.js';

/** 個人リストの識別に使うビジネスキー */
export interface PersonalListKey {
  userId: string;
  listId: string;
}

/** 個人リストアイテムの SK の接頭辞。一覧の Query で使う */
export const PERSONAL_LIST_SK_PREFIX = 'PLIST#';

/**
 * ユーザー ID から個人リストアイテムの PK を構築する
 *
 * @param userId - ユーザー ID
 */
export function buildPersonalListPk(userId: string): string {
  return `USER#${userId}`;
}

/**
 * PersonalList Mapper
 *
 * PersonalList と DynamoDB Item の相互変換を担当する。
 * 保存は PascalCase の属性名と数値ミリ秒の時刻で行い、読み取りは旧形式
 * (camelCase の属性名と ISO 文字列の時刻) も受け付ける。
 */
export class PersonalListMapper implements EntityMapper<PersonalList, PersonalListKey> {
  public readonly entityType = 'PersonalList';

  // 旧形式のデータは書き込まれるまで残るため、更新時に旧名を消して二重に残さない
  public readonly legacyAttributeNames = {
    ListID: ['listId'],
    UserID: ['userId'],
    Name: ['name'],
    IsDefault: ['isDefault'],
    CreatedAt: ['createdAt'],
    UpdatedAt: ['updatedAt'],
  } as const;

  public buildKeys(key: PersonalListKey): DynamoDBKey {
    return {
      PK: buildPersonalListPk(key.userId),
      SK: `${PERSONAL_LIST_SK_PREFIX}${key.listId}`,
    };
  }

  public getKey(entity: PersonalList): PersonalListKey {
    return { userId: entity.userId, listId: entity.listId };
  }

  public toItem(entity: PersonalList): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      ListID: entity.listId,
      UserID: entity.userId,
      Name: entity.name,
      IsDefault: entity.isDefault,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };
  }

  /**
   * Entity の部分を保存用の属性に変換する
   *
   * listId / userId はキーに、createdAt は作成時の値として固定される。isDefault は
   * デフォルトリストの付け替えをしない運用のため、更新の入力型に無く、含めると拒否する。
   *
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<PersonalList>): DynamoDBAttributes {
    return {
      ListID: immutablePatchValue(changes.listId, 'ListID'),
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      IsDefault: immutablePatchValue(changes.isDefault, 'IsDefault'),
      Name: requiredPatchValue(changes.name, 'Name'),
    };
  }

  public toEntity(item: DynamoDBAttributes): PersonalList {
    const legacy = this.legacyAttributeNames;

    return {
      listId: validateStringField(readAttribute(item, 'ListID', legacy.ListID), 'ListID'),
      userId: validateStringField(readAttribute(item, 'UserID', legacy.UserID), 'UserID'),
      name: validateStringField(readAttribute(item, 'Name', legacy.Name), 'Name', {
        allowEmpty: true,
      }),
      isDefault: validateBooleanField(
        readAttribute(item, 'IsDefault', legacy.IsDefault),
        'IsDefault'
      ),
      createdAt: readTimestamp(item, 'CreatedAt', legacy.CreatedAt),
      updatedAt: readTimestamp(item, 'UpdatedAt', legacy.UpdatedAt),
    };
  }
}
