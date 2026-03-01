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
  invitedAt: string;
}

export interface RespondInvitationInput {
  groupId: string;
  userId: string;
  response: 'ACCEPT' | 'REJECT';
  respondedAt: string;
}

export interface LeaveGroupInput {
  groupId: string;
  userId: string;
}

export function validateMemberLimit(memberships: GroupMembership[]): void {
  const acceptedCount = memberships.filter((membership) => membership.status === 'ACCEPTED').length;
  if (acceptedCount >= GROUP_RULES.MAX_MEMBER_COUNT) {
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

export function calculateInvitationTtl(invitedAt: string): number {
  return Math.floor(new Date(invitedAt).getTime() / 1000) + GROUP_RULES.INVITATION_TTL_SECONDS;
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
  validateMemberLimit(memberships);

  const existingMembership = await dependencies.membershipRepository.getById(
    input.groupId,
    input.userId
  );
  validateNoDuplicateInvitation(existingMembership);
  if (existingMembership?.status === 'ACCEPTED') {
    throw new Error(ERROR_MESSAGES.ALREADY_GROUP_MEMBER);
  }

  const ttl = calculateInvitationTtl(input.invitedAt);
  if (existingMembership?.status === 'REJECTED') {
    return dependencies.membershipRepository.update(input.groupId, input.userId, {
      status: 'PENDING',
      invitedBy: input.invitedBy,
      invitedAt: input.invitedAt,
      respondedAt: undefined,
      ttl,
    });
  }

  return dependencies.membershipRepository.create({
    groupId: input.groupId,
    userId: input.userId,
    role: 'MEMBER',
    status: 'PENDING',
    invitedBy: input.invitedBy,
    invitedAt: input.invitedAt,
    ttl,
  });
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

  return dependencies.membershipRepository.update(input.groupId, input.userId, {
    status: input.response === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
    respondedAt: input.respondedAt,
    ttl: undefined,
  });
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
  await dependencies.membershipRepository.delete(input.groupId, input.userId);
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
  await dependencies.membershipRepository.delete(groupId, userId);
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
