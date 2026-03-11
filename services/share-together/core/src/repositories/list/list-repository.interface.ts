import type {
  PersonalList,
  GroupList,
  CreatePersonalListInput,
  UpdatePersonalListInput,
  CreateGroupListInput,
  UpdateGroupListInput,
} from '../../types/index.js';

export interface ListRepository {
  getPersonalListsByUserId(userId: string): Promise<PersonalList[]>;
  getPersonalListById(userId: string, listId: string): Promise<PersonalList | null>;
  createPersonalList(input: CreatePersonalListInput): Promise<PersonalList>;
  updatePersonalList(
    userId: string,
    listId: string,
    updates: UpdatePersonalListInput
  ): Promise<PersonalList>;
  deletePersonalList(userId: string, listId: string): Promise<void>;

  getGroupListsByGroupId(groupId: string): Promise<GroupList[]>;
  getGroupListById(groupId: string, listId: string): Promise<GroupList | null>;
  createGroupList(input: CreateGroupListInput): Promise<GroupList>;
  updateGroupList(
    groupId: string,
    listId: string,
    updates: UpdateGroupListInput
  ): Promise<GroupList>;
  deleteGroupList(groupId: string, listId: string): Promise<void>;
}
