import type {
  GroupMembership,
  CreateGroupMembershipInput,
  UpdateGroupMembershipInput,
} from '../../types/index.js';

export interface MembershipRepository {
  getById(groupId: string, userId: string): Promise<GroupMembership | null>;
  getByGroupId(groupId: string): Promise<GroupMembership[]>;
  getByUserId(userId: string): Promise<GroupMembership[]>;
  getPendingInvitationsByUserId(userId: string): Promise<GroupMembership[]>;
  create(input: CreateGroupMembershipInput): Promise<GroupMembership>;
  update(
    groupId: string,
    userId: string,
    updates: UpdateGroupMembershipInput
  ): Promise<GroupMembership>;
  delete(groupId: string, userId: string): Promise<void>;
  deleteByGroupId(groupId: string): Promise<void>;
}
