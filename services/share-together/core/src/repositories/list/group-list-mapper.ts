import {
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
import type { GroupList } from '../../types/index.js';

/** グループリストの識別に使うビジネスキー */
export interface GroupListKey {
  groupId: string;
  listId: string;
}

/** グループリストアイテムの SK の接頭辞。一覧の Query で使う */
export const GROUP_LIST_SK_PREFIX = 'GLIST#';

/**
 * グループ ID からグループリストアイテムの PK を構築する
 *
 * @param groupId - グループ ID
 */
export function buildGroupListPk(groupId: string): string {
  return `GROUP#${groupId}`;
}

/**
 * GroupList Mapper
 *
 * GroupList と DynamoDB Item の相互変換を担当する。
 * 保存は PascalCase の属性名と数値ミリ秒の時刻で行い、読み取りは旧形式
 * (camelCase の属性名と ISO 文字列の時刻) も受け付ける。
 */
export class GroupListMapper implements EntityMapper<GroupList, GroupListKey> {
  public readonly entityType = 'GroupList';

  // 旧形式のデータは書き込まれるまで残るため、更新時に旧名を消して二重に残さない
  public readonly legacyAttributeNames = {
    ListID: ['listId'],
    GroupID: ['groupId'],
    Name: ['name'],
    CreatedBy: ['createdBy'],
    CreatedAt: ['createdAt'],
    UpdatedAt: ['updatedAt'],
  } as const;

  public buildKeys(key: GroupListKey): DynamoDBKey {
    return {
      PK: buildGroupListPk(key.groupId),
      SK: `${GROUP_LIST_SK_PREFIX}${key.listId}`,
    };
  }

  public getKey(entity: GroupList): GroupListKey {
    return { groupId: entity.groupId, listId: entity.listId };
  }

  public toItem(entity: GroupList): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      ListID: entity.listId,
      GroupID: entity.groupId,
      Name: entity.name,
      CreatedBy: entity.createdBy,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };
  }

  /**
   * Entity の部分を保存用の属性に変換する
   *
   * listId / groupId はキーに、createdBy / createdAt は作成時の値として固定される。
   *
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<GroupList>): DynamoDBAttributes {
    return {
      ListID: immutablePatchValue(changes.listId, 'ListID'),
      GroupID: immutablePatchValue(changes.groupId, 'GroupID'),
      CreatedBy: immutablePatchValue(changes.createdBy, 'CreatedBy'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Name: requiredPatchValue(changes.name, 'Name'),
    };
  }

  public toEntity(item: DynamoDBAttributes): GroupList {
    const legacy = this.legacyAttributeNames;

    return {
      listId: validateStringField(readAttribute(item, 'ListID', legacy.ListID), 'ListID'),
      groupId: validateStringField(readAttribute(item, 'GroupID', legacy.GroupID), 'GroupID'),
      name: validateStringField(readAttribute(item, 'Name', legacy.Name), 'Name', {
        allowEmpty: true,
      }),
      createdBy: validateStringField(
        readAttribute(item, 'CreatedBy', legacy.CreatedBy),
        'CreatedBy'
      ),
      createdAt: readTimestamp(item, 'CreatedAt', legacy.CreatedAt),
      updatedAt: readTimestamp(item, 'UpdatedAt', legacy.UpdatedAt),
    };
  }
}
