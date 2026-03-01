import type { GroupMembership } from '../types/index.js';
import type { GroupRepository } from '../repositories/group/group-repository.interface.js';
import type { ListRepository } from '../repositories/list/list-repository.interface.js';
import type { MembershipRepository } from '../repositories/membership/membership-repository.interface.js';
import type { TodoRepository } from '../repositories/todo/todo-repository.interface.js';

export const GROUP_RULES = {
  MAX_MEMBER_COUNT: 5,
} as const;

export const ERROR_MESSAGES = {
  MEMBER_LIMIT_EXCEEDED: 'グループメンバーは最大5名です',
  OWNER_CANNOT_LEAVE: 'オーナーはグループから脱退できません',
  DUPLICATE_INVITATION: '同じユーザーには重複して招待できません',
} as const;

export interface CascadeDeleteDependencies {
  groupRepository: GroupRepository;
  membershipRepository: MembershipRepository;
  listRepository: ListRepository;
  todoRepository: TodoRepository;
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

export function validateNoDuplicateInvitation(existingMembership: GroupMembership | null): void {
  if (existingMembership?.status === 'PENDING') {
    throw new Error(ERROR_MESSAGES.DUPLICATE_INVITATION);
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
