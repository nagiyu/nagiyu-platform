import {
  TTL_ATTRIBUTE_NAME,
  immutablePatchValue,
  optionalPatchValue,
  readAttribute,
  readOptionalTimestamp,
  readTimestamp,
  requiredPatchValue,
  toTtlSeconds,
  validateEnumField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { GroupMembership, GroupMembershipStatus, GroupRole } from '../../types/index.js';

/** メンバーシップの識別に使うビジネスキー */
export interface MembershipKey {
  groupId: string;
  userId: string;
}

/** メンバーシップアイテムの SK の接頭辞。グループ内のメンバー一覧の Query で使う */
export const MEMBER_SK_PREFIX = 'MEMBER#';

/** ユーザー単位の一覧 (所属グループ・受信した招待) を引く GSI の名前 */
export const MEMBERSHIP_GSI1_INDEX_NAME = 'GSI1';

const GROUP_ROLES = ['OWNER', 'MEMBER'] as const satisfies readonly GroupRole[];
const MEMBERSHIP_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
] as const satisfies readonly GroupMembershipStatus[];

/**
 * グループ ID からメンバーシップアイテムの PK を構築する
 *
 * @param groupId - グループ ID
 */
export function buildMembershipPk(groupId: string): string {
  return `GROUP#${groupId}`;
}

/**
 * ユーザー ID からメンバーシップアイテムの GSI1PK を構築する
 *
 * @param userId - ユーザー ID
 */
export function buildMembershipGsi1Pk(userId: string): string {
  return `USER#${userId}`;
}

/**
 * グループ ID からメンバーシップアイテムの GSI1SK を構築する
 *
 * @param groupId - グループ ID
 */
export function buildMembershipGsi1Sk(groupId: string): string {
  return `GROUP#${groupId}`;
}

/**
 * GroupMembership Mapper
 *
 * GroupMembership と DynamoDB Item の相互変換を担当する。
 * 保存は PascalCase の属性名と数値ミリ秒の時刻で行い、読み取りは旧形式
 * (camelCase の属性名と ISO 文字列の時刻) も受け付ける。
 * 招待の有効期限は TTL 属性にエポック秒で保存し、Entity ではミリ秒の expiresAt で持つ。
 */
export class GroupMembershipMapper implements EntityMapper<GroupMembership, MembershipKey> {
  public readonly entityType = 'GroupMembership';

  // 旧形式のデータは書き込まれるまで残るため、更新時に旧名を消して二重に残さない。
  // TTL は旧形式でも同じ名前なので宣言しない
  public readonly legacyAttributeNames = {
    GroupID: ['groupId'],
    UserID: ['userId'],
    Role: ['role'],
    Status: ['status'],
    InvitedBy: ['invitedBy'],
    InvitedAt: ['invitedAt'],
    RespondedAt: ['respondedAt'],
    CreatedAt: ['createdAt'],
    UpdatedAt: ['updatedAt'],
  } as const;

  public buildKeys(key: MembershipKey): DynamoDBKey {
    return {
      PK: buildMembershipPk(key.groupId),
      SK: `${MEMBER_SK_PREFIX}${key.userId}`,
    };
  }

  public getKey(entity: GroupMembership): MembershipKey {
    return { groupId: entity.groupId, userId: entity.userId };
  }

  public toItem(entity: GroupMembership): DynamoDBAttributes {
    const item: DynamoDBAttributes = {
      ...this.buildKeys(this.getKey(entity)),
      GSI1PK: buildMembershipGsi1Pk(entity.userId),
      GSI1SK: buildMembershipGsi1Sk(entity.groupId),
      Type: this.entityType,
      GroupID: entity.groupId,
      UserID: entity.userId,
      Role: entity.role,
      Status: entity.status,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };

    // 任意項目は、ないときは属性ごと省く
    if (entity.invitedBy !== undefined) {
      item.InvitedBy = entity.invitedBy;
    }
    if (entity.invitedAt !== undefined) {
      item.InvitedAt = entity.invitedAt;
    }
    if (entity.respondedAt !== undefined) {
      item.RespondedAt = entity.respondedAt;
    }
    if (entity.expiresAt !== undefined) {
      item[TTL_ATTRIBUTE_NAME] = toTtlSeconds(entity.expiresAt);
    }

    return item;
  }

  /**
   * Entity の部分を保存用の属性に変換する
   *
   * groupId / userId はキーに、createdAt は作成時の値として固定される。
   * GSI1 は更新のたびに key から付け直し、patch に識別子を混ぜさせない。
   * invitedBy / invitedAt / respondedAt / expiresAt は null を渡すと属性を削除する。
   *
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(
    changes: EntityPatch<GroupMembership>,
    key: MembershipKey
  ): DynamoDBAttributes {
    return {
      GroupID: immutablePatchValue(changes.groupId, 'GroupID'),
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      GSI1PK: buildMembershipGsi1Pk(key.userId),
      GSI1SK: buildMembershipGsi1Sk(key.groupId),
      Role: requiredPatchValue(changes.role, 'Role'),
      Status: requiredPatchValue(changes.status, 'Status'),
      InvitedBy: optionalPatchValue(changes.invitedBy),
      InvitedAt: optionalPatchValue(changes.invitedAt),
      RespondedAt: optionalPatchValue(changes.respondedAt),
      // TTL 属性だけは DynamoDB の仕様でエポック秒にする
      [TTL_ATTRIBUTE_NAME]:
        typeof changes.expiresAt === 'number'
          ? toTtlSeconds(changes.expiresAt)
          : optionalPatchValue(changes.expiresAt),
    };
  }

  public toEntity(item: DynamoDBAttributes): GroupMembership {
    const legacy = this.legacyAttributeNames;
    const invitedBy = readAttribute(item, 'InvitedBy', legacy.InvitedBy);
    const invitedAt = readOptionalTimestamp(item, 'InvitedAt', legacy.InvitedAt);
    const respondedAt = readOptionalTimestamp(item, 'RespondedAt', legacy.RespondedAt);
    const expiresAt = readOptionalTimestamp(item, TTL_ATTRIBUTE_NAME);

    return {
      groupId: validateStringField(readAttribute(item, 'GroupID', legacy.GroupID), 'GroupID'),
      userId: validateStringField(readAttribute(item, 'UserID', legacy.UserID), 'UserID'),
      role: validateEnumField(readAttribute(item, 'Role', legacy.Role), 'Role', GROUP_ROLES),
      status: validateEnumField(
        readAttribute(item, 'Status', legacy.Status),
        'Status',
        MEMBERSHIP_STATUSES
      ),
      // 任意項目はキーごと省き、JSON に null や undefined を出さない
      ...(invitedBy === undefined
        ? {}
        : { invitedBy: validateStringField(invitedBy, 'InvitedBy') }),
      ...(invitedAt === undefined ? {} : { invitedAt }),
      ...(respondedAt === undefined ? {} : { respondedAt }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
      createdAt: readTimestamp(item, 'CreatedAt', legacy.CreatedAt),
      updatedAt: readTimestamp(item, 'UpdatedAt', legacy.UpdatedAt),
    };
  }
}
