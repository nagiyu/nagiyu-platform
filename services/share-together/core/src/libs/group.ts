import { EntityAlreadyExistsError, EntityNotFoundError } from '@nagiyu/aws';
import type { Group, GroupMembership } from '../types/index.js';
import type { GroupRepository } from '../repositories/group/group-repository.interface.js';
import type { ListRepository } from '../repositories/list/list-repository.interface.js';
import type { MembershipRepository } from '../repositories/membership/membership-repository.interface.js';
import type { TodoRepository } from '../repositories/todo/todo-repository.interface.js';

export const GROUP_RULES = {
  MAX_MEMBER_COUNT: 5,
  INVITATION_TTL_SECONDS: 86400,
} as const;

export const ERROR_MESSAGES = {
  MEMBER_LIMIT_EXCEEDED: 'グループメンバーは最大5名です',
  OWNER_CANNOT_LEAVE: 'オーナーはグループから脱退できません',
  OWNER_CANNOT_BE_REMOVED: 'オーナーはグループから除外できません',
  DUPLICATE_INVITATION: '同じユーザーには重複して招待できません',
  ALREADY_GROUP_MEMBER: 'すでにグループメンバーです',
  INVITATION_NOT_FOUND: '招待が見つかりません',
  INVITATION_ALREADY_RESPONDED: 'この招待にはすでに回答済みです',
  MEMBERSHIP_NOT_FOUND: 'メンバーシップが見つかりません',
} as const;

export interface CascadeDeleteDependencies {
  groupRepository: GroupRepository;
  membershipRepository: MembershipRepository;
  listRepository: ListRepository;
  todoRepository: TodoRepository;
}

export interface GroupOperationDependencies {
  groupRepository: GroupRepository;
  membershipRepository: MembershipRepository;
}

export interface CreateGroupOperationInput {
  groupId: string;
  name: string;
  ownerUserId: string;
}

export interface InviteMemberInput {
  groupId: string;
  userId: string;
  invitedBy: string;
  /** 招待日時 (エポックミリ秒) */
  invitedAt: number;
}

export interface RespondInvitationInput {
  groupId: string;
  userId: string;
  response: 'ACCEPT' | 'REJECT';
  /** 応答日時 (エポックミリ秒) */
  respondedAt: number;
}

export interface LeaveGroupInput {
  groupId: string;
  userId: string;
}

/**
 * 承認済みメンバー数が上限に達していないことを検証する
 *
 * 承認時は、承認待ちの招待が他にあっても承認済みの人数だけで判定する。
 * 承認待ちを数えると、上限ちょうどまで招待した全員が承認できなくなる。
 */
export function validateAcceptLimit(memberships: GroupMembership[]): void {
  const acceptedCount = memberships.filter((membership) => membership.status === 'ACCEPTED').length;
  if (acceptedCount >= GROUP_RULES.MAX_MEMBER_COUNT) {
    throw new Error(ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED);
  }
}

/**
 * 承認済みメンバーと有効な承認待ちの招待の合計が上限に達していないことを検証する
 *
 * 承認待ちを数えないと、上限を超える人数へ招待を送れてしまい、承認の段階で初めて失敗する。
 * 期限切れでも TTL による削除は遅れて行われるため、期限は招待日時と比較して除外する。
 *
 * @param memberships - グループのメンバーシップ一覧
 * @param now - 承認待ちの期限判定に使う日時 (エポックミリ秒)
 */
export function validateInviteLimit(memberships: GroupMembership[], now: number): void {
  const occupiedCount = memberships.filter(
    (membership) =>
      membership.status === 'ACCEPTED' ||
      (membership.status === 'PENDING' &&
        (membership.expiresAt === undefined || membership.expiresAt > now))
  ).length;
  if (occupiedCount >= GROUP_RULES.MAX_MEMBER_COUNT) {
    throw new Error(ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED);
  }
}

export function validateOwnerCanLeave(membership: GroupMembership): void {
  if (membership.role === 'OWNER') {
    throw new Error(ERROR_MESSAGES.OWNER_CANNOT_LEAVE);
  }
}

export function validateOwnerCanBeRemoved(membership: GroupMembership): void {
  if (membership.role === 'OWNER') {
    throw new Error(ERROR_MESSAGES.OWNER_CANNOT_BE_REMOVED);
  }
}

export function validateNoDuplicateInvitation(existingMembership: GroupMembership | null): void {
  if (existingMembership?.status === 'PENDING') {
    throw new Error(ERROR_MESSAGES.DUPLICATE_INVITATION);
  }
}

/**
 * 招待の有効期限をエポックミリ秒で返す
 *
 * @param invitedAt - 招待日時 (エポックミリ秒)
 */
export function calculateInvitationExpiresAt(invitedAt: number): number {
  return invitedAt + GROUP_RULES.INVITATION_TTL_SECONDS * 1000;
}

/**
 * リポジトリの不在エラーを業務エラーに変換する。それ以外のエラーはそのまま返す。
 */
function toBusinessError(error: unknown, notFoundMessage: string): unknown {
  return error instanceof EntityNotFoundError ? new Error(notFoundMessage) : error;
}

export async function createGroup(
  input: CreateGroupOperationInput,
  dependencies: GroupOperationDependencies
): Promise<{ group: Group; ownerMembership: GroupMembership }> {
  const group = await dependencies.groupRepository.create({
    groupId: input.groupId,
    name: input.name,
    ownerUserId: input.ownerUserId,
  });
  const ownerMembership = await dependencies.membershipRepository.create({
    groupId: input.groupId,
    userId: input.ownerUserId,
    role: 'OWNER',
    status: 'ACCEPTED',
  });

  return { group, ownerMembership };
}

export async function inviteMember(
  input: InviteMemberInput,
  dependencies: GroupOperationDependencies
): Promise<GroupMembership> {
  const memberships = await dependencies.membershipRepository.getByGroupId(input.groupId);
  validateInviteLimit(memberships, input.invitedAt);

  const existingMembership = await dependencies.membershipRepository.getById(
    input.groupId,
    input.userId
  );
  validateNoDuplicateInvitation(existingMembership);
  if (existingMembership?.status === 'ACCEPTED') {
    throw new Error(ERROR_MESSAGES.ALREADY_GROUP_MEMBER);
  }

  const expiresAt = calculateInvitationExpiresAt(input.invitedAt);
  if (existingMembership?.status === 'REJECTED') {
    return dependencies.membershipRepository.update(input.groupId, input.userId, {
      status: 'PENDING',
      invitedBy: input.invitedBy,
      invitedAt: input.invitedAt,
      // 拒否時の応答日時を残すと、再び応答待ちになった招待が応答済みに見える
      respondedAt: null,
      expiresAt,
    });
  }

  try {
    return await dependencies.membershipRepository.create({
      groupId: input.groupId,
      userId: input.userId,
      role: 'MEMBER',
      status: 'PENDING',
      invitedBy: input.invitedBy,
      invitedAt: input.invitedAt,
      expiresAt,
    });
  } catch (error) {
    // 存在確認から作成までの間に、同じ相手への招待が先に作られた場合
    if (error instanceof EntityAlreadyExistsError) {
      throw new Error(ERROR_MESSAGES.DUPLICATE_INVITATION, { cause: error });
    }
    throw error;
  }
}

export async function respondToInvitation(
  input: RespondInvitationInput,
  dependencies: GroupOperationDependencies
): Promise<GroupMembership> {
  const membership = await dependencies.membershipRepository.getById(input.groupId, input.userId);
  if (!membership) {
    throw new Error(ERROR_MESSAGES.INVITATION_NOT_FOUND);
  }
  if (membership.status !== 'PENDING') {
    throw new Error(ERROR_MESSAGES.INVITATION_ALREADY_RESPONDED);
  }

  if (input.response === 'ACCEPT') {
    const memberships = await dependencies.membershipRepository.getByGroupId(input.groupId);
    validateAcceptLimit(memberships);
  }

  try {
    return await dependencies.membershipRepository.update(input.groupId, input.userId, {
      status: input.response === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
      respondedAt: input.respondedAt,
      // 応答済みの招待は期限切れで消えないよう、TTL を外す
      expiresAt: null,
    });
  } catch (error) {
    // 存在確認から更新までの間に招待が消えた場合
    throw toBusinessError(error, ERROR_MESSAGES.INVITATION_NOT_FOUND);
  }
}

export async function leaveGroup(
  input: LeaveGroupInput,
  dependencies: GroupOperationDependencies
): Promise<void> {
  const membership = await dependencies.membershipRepository.getById(input.groupId, input.userId);
  if (!membership) {
    throw new Error(ERROR_MESSAGES.MEMBERSHIP_NOT_FOUND);
  }

  validateOwnerCanLeave(membership);
  try {
    await dependencies.membershipRepository.delete(input.groupId, input.userId);
  } catch (error) {
    // 存在確認から削除までの間にメンバーシップが消えた場合
    throw toBusinessError(error, ERROR_MESSAGES.MEMBERSHIP_NOT_FOUND);
  }
}

export async function removeMember(
  groupId: string,
  userId: string,
  dependencies: GroupOperationDependencies
): Promise<void> {
  const membership = await dependencies.membershipRepository.getById(groupId, userId);
  if (!membership) {
    throw new Error(ERROR_MESSAGES.MEMBERSHIP_NOT_FOUND);
  }

  validateOwnerCanBeRemoved(membership);
  try {
    await dependencies.membershipRepository.delete(groupId, userId);
  } catch (error) {
    // 存在確認から削除までの間にメンバーシップが消えた場合
    throw toBusinessError(error, ERROR_MESSAGES.MEMBERSHIP_NOT_FOUND);
  }
}

export async function deleteGroupWithCascade(
  groupId: string,
  dependencies: CascadeDeleteDependencies
): Promise<void> {
  const groupLists = await dependencies.listRepository.getGroupListsByGroupId(groupId);
  for (const groupList of groupLists) {
    await dependencies.todoRepository.deleteByListId(groupList.listId);
    await dependencies.listRepository.deleteGroupList(groupId, groupList.listId);
  }

  await dependencies.membershipRepository.deleteByGroupId(groupId);
  await dependencies.groupRepository.delete(groupId);
}
