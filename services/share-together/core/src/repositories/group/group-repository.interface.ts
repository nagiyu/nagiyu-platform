import type { Group, CreateGroupInput, UpdateGroupInput } from '../../types/index.js';

export interface GroupRepository {
  getById(groupId: string): Promise<Group | null>;
  batchGetByIds(groupIds: string[]): Promise<Group[]>;
  create(input: CreateGroupInput): Promise<Group>;
  update(groupId: string, updates: UpdateGroupInput): Promise<Group>;
  delete(groupId: string): Promise<void>;
}
