import type {
  CreateGroupMembershipInput,
  GroupMembership,
  UpdateGroupMembershipInput,
} from '../../types/index.js';
import type { MembershipRepository } from './membership-repository.interface.js';

const ERROR_MESSAGES = {
  MEMBERSHIP_NOT_FOUND: 'メンバーシップが見つかりません',
  MEMBERSHIP_ALREADY_EXISTS: 'メンバーシップは既に存在します',
} as const;

export class InMemoryMembershipRepository implements MembershipRepository {
  private readonly memberships = new Map<string, GroupMembership>();
  private readonly membershipKeysByGroupId = new Map<string, Set<string>>();
  private readonly membershipKeysByUserId = new Map<string, Set<string>>();

  public async getById(groupId: string, userId: string): Promise<GroupMembership | null> {
    const membership = this.memberships.get(this.createMembershipKey(groupId, userId));
    return membership ? { ...membership } : null;
  }

  public async getByGroupId(groupId: string): Promise<GroupMembership[]> {
    return this.getMembershipsByKeys(this.membershipKeysByGroupId.get(groupId));
  }

  public async getByUserId(userId: string): Promise<GroupMembership[]> {
    return this.getMembershipsByKeys(this.membershipKeysByUserId.get(userId));
  }

  public async getPendingInvitationsByUserId(userId: string): Promise<GroupMembership[]> {
    const memberships = await this.getByUserId(userId);
    return memberships.filter((membership) => membership.status === 'PENDING');
  }

  public async create(input: CreateGroupMembershipInput): Promise<GroupMembership> {
    const membershipKey = this.createMembershipKey(input.groupId, input.userId);
    if (this.memberships.has(membershipKey)) {
      throw new Error(ERROR_MESSAGES.MEMBERSHIP_ALREADY_EXISTS);
    }

    const now = new Date().toISOString();
    const membership: GroupMembership = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    this.memberships.set(membershipKey, membership);
    this.addMembershipIndex(this.membershipKeysByGroupId, membership.groupId, membershipKey);
    this.addMembershipIndex(this.membershipKeysByUserId, membership.userId, membershipKey);

    return { ...membership };
  }

  public async update(
    groupId: string,
    userId: string,
    updates: UpdateGroupMembershipInput
  ): Promise<GroupMembership> {
    const membershipKey = this.createMembershipKey(groupId, userId);
    const existingMembership = this.memberships.get(membershipKey);
    if (!existingMembership) {
      throw new Error(ERROR_MESSAGES.MEMBERSHIP_NOT_FOUND);
    }

    const updatedMembership: GroupMembership = {
      ...existingMembership,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.memberships.set(membershipKey, updatedMembership);
    return { ...updatedMembership };
  }

  public async delete(groupId: string, userId: string): Promise<void> {
    const membershipKey = this.createMembershipKey(groupId, userId);
    const existingMembership = this.memberships.get(membershipKey);
    if (!existingMembership) {
      return;
    }

    this.memberships.delete(membershipKey);
    this.deleteMembershipIndex(this.membershipKeysByGroupId, existingMembership.groupId, membershipKey);
    this.deleteMembershipIndex(this.membershipKeysByUserId, existingMembership.userId, membershipKey);
  }

  public async deleteByGroupId(groupId: string): Promise<void> {
    const membershipKeys = this.membershipKeysByGroupId.get(groupId);
    if (!membershipKeys) {
      return;
    }

    for (const membershipKey of membershipKeys) {
      const membership = this.memberships.get(membershipKey);
      if (!membership) {
        continue;
      }

      this.memberships.delete(membershipKey);
      this.deleteMembershipIndex(this.membershipKeysByUserId, membership.userId, membershipKey);
    }

    this.membershipKeysByGroupId.delete(groupId);
  }

  private createMembershipKey(groupId: string, userId: string): string {
    return `${groupId}:${userId}`;
  }

  private getMembershipsByKeys(membershipKeys?: Set<string>): GroupMembership[] {
    if (!membershipKeys) {
      return [];
    }

    const memberships: GroupMembership[] = [];
    for (const membershipKey of membershipKeys) {
      const membership = this.memberships.get(membershipKey);
      if (membership) {
        memberships.push({ ...membership });
      }
    }

    return memberships;
  }

  private addMembershipIndex(
    indexMap: Map<string, Set<string>>,
    indexKey: string,
    membershipKey: string
  ): void {
    if (!indexMap.has(indexKey)) {
      indexMap.set(indexKey, new Set());
    }

    indexMap.get(indexKey)?.add(membershipKey);
  }

  private deleteMembershipIndex(
    indexMap: Map<string, Set<string>>,
    indexKey: string,
    membershipKey: string
  ): void {
    const membershipKeys = indexMap.get(indexKey);
    if (!membershipKeys) {
      return;
    }

    membershipKeys.delete(membershipKey);
    if (membershipKeys.size === 0) {
      indexMap.delete(indexKey);
    }
  }
}
