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
import type { Group } from '../../types/index.js';

/** グループの識別に使うビジネスキー */
export interface GroupKey {
  groupId: string;
}

/** グループアイテムの SK。グループは 1 件のメタ情報アイテムだけを持つ */
export const GROUP_META_SK = '#META#';

/**
 * グループ ID からグループアイテムの PK を構築する
 *
 * @param groupId - グループ ID
 */
export function buildGroupPk(groupId: string): string {
  return `GROUP#${groupId}`;
}

/**
 * Group Mapper
 *
 * Group と DynamoDB Item の相互変換を担当する。
 * 保存は PascalCase の属性名と数値ミリ秒の時刻で行い、読み取りは旧形式
 * (camelCase の属性名と ISO 文字列の時刻) も受け付ける。
 */
export class GroupMapper implements EntityMapper<Group, GroupKey> {
  public readonly entityType = 'Group';

  // 旧形式のデータは書き込まれるまで残るため、更新時に旧名を消して二重に残さない
  public readonly legacyAttributeNames = {
    GroupID: ['groupId'],
    Name: ['name'],
    OwnerUserID: ['ownerUserId'],
    CreatedAt: ['createdAt'],
    UpdatedAt: ['updatedAt'],
  } as const;

  public buildKeys(key: GroupKey): DynamoDBKey {
    return {
      PK: buildGroupPk(key.groupId),
      SK: GROUP_META_SK,
    };
  }

  public getKey(entity: Group): GroupKey {
    return { groupId: entity.groupId };
  }

  public toItem(entity: Group): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      GroupID: entity.groupId,
      Name: entity.name,
      OwnerUserID: entity.ownerUserId,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };
  }

  /**
   * Entity の部分を保存用の属性に変換する
   *
   * groupId は PK に、createdAt は作成時の値として固定される。ownerUserId は作成後に
   * 付け替えない運用のため、更新の入力型に無く、含めると拒否する。
   *
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<Group>): DynamoDBAttributes {
    return {
      GroupID: immutablePatchValue(changes.groupId, 'GroupID'),
      OwnerUserID: immutablePatchValue(changes.ownerUserId, 'OwnerUserID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Name: requiredPatchValue(changes.name, 'Name'),
    };
  }

  public toEntity(item: DynamoDBAttributes): Group {
    const legacy = this.legacyAttributeNames;

    return {
      groupId: validateStringField(readAttribute(item, 'GroupID', legacy.GroupID), 'GroupID'),
      name: validateStringField(readAttribute(item, 'Name', legacy.Name), 'Name', {
        allowEmpty: true,
      }),
      ownerUserId: validateStringField(
        readAttribute(item, 'OwnerUserID', legacy.OwnerUserID),
        'OwnerUserID'
      ),
      createdAt: readTimestamp(item, 'CreatedAt', legacy.CreatedAt),
      updatedAt: readTimestamp(item, 'UpdatedAt', legacy.UpdatedAt),
    };
  }
}
