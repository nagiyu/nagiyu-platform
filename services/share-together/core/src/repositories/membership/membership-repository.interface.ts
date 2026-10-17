import type {
  GroupMembership,
  CreateGroupMembershipInput,
  UpdateGroupMembershipInput,
} from '../../types/index.js';

export interface MembershipRepository {
  getById(groupId: string, userId: string): Promise<GroupMembership | null>;
  /** メンバーのユーザー ID の昇順で返す (DynamoDB のソートキー順) */
  getByGroupId(groupId: string): Promise<GroupMembership[]>;
  /** 所属しているグループの ID の昇順で返す (GSI1 のソートキー順) */
  getByUserId(userId: string): Promise<GroupMembership[]>;
  /** 応答待ち (PENDING) の招待だけを返す */
  getPendingInvitationsByUserId(userId: string): Promise<GroupMembership[]>;
  /** @throws EntityAlreadyExistsError 同じグループ・ユーザーのメンバーシップが既に存在するとき */
  create(input: CreateGroupMembershipInput): Promise<GroupMembership>;
  /**
   * 任意項目 (invitedBy・invitedAt・respondedAt・expiresAt) は、null を渡すと削除し、
   * undefined は変更しない。
   *
   * @throws EntityNotFoundError メンバーシップが存在しないとき
   */
  update(
    groupId: string,
    userId: string,
    updates: UpdateGroupMembershipInput
  ): Promise<GroupMembership>;
  /** @throws EntityNotFoundError メンバーシップが存在しないとき */
  delete(groupId: string, userId: string): Promise<void>;
  /** グループのメンバーシップをすべて削除する。1 件もなくても成功する */
  deleteByGroupId(groupId: string): Promise<void>;
}
