import type { CreateGroupInput, Group, UpdateGroupInput } from '../../types/index.js';
import type { GroupRepository } from './group-repository.interface.js';

const ERROR_MESSAGES = {
  GROUP_NOT_FOUND: 'グループが見つかりません',
  GROUP_ALREADY_EXISTS: 'グループは既に存在します',
} as const;

export class InMemoryGroupRepository implements GroupRepository {
  private readonly groups = new Map<string, Group>();

  public async getById(groupId: string): Promise<Group | null> {
    const group = this.groups.get(groupId);
    return group ? { ...group } : null;
  }

  public async batchGetByIds(groupIds: string[]): Promise<Group[]> {
    return groupIds
      .map((groupId) => this.groups.get(groupId))
      .filter((group): group is Group => group !== undefined)
      .map((group) => ({ ...group }));
  }

  public async create(input: CreateGroupInput): Promise<Group> {
    if (this.groups.has(input.groupId)) {
      throw new Error(ERROR_MESSAGES.GROUP_ALREADY_EXISTS);
    }

    const now = new Date().toISOString();
    const group: Group = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    this.groups.set(group.groupId, group);
    return { ...group };
  }

  public async update(groupId: string, updates: UpdateGroupInput): Promise<Group> {
    const existingGroup = this.groups.get(groupId);
    if (!existingGroup) {
      throw new Error(ERROR_MESSAGES.GROUP_NOT_FOUND);
    }

    const updatedGroup: Group = {
      ...existingGroup,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.groups.set(groupId, updatedGroup);
    return { ...updatedGroup };
  }

  public async delete(groupId: string): Promise<void> {
    this.groups.delete(groupId);
  }
}
