import type {
  CreateGroupListInput,
  CreatePersonalListInput,
  GroupList,
  PersonalList,
  UpdateGroupListInput,
  UpdatePersonalListInput,
} from '../../types/index.js';
import type { ListRepository } from './list-repository.interface.js';

const ERROR_MESSAGES = {
  PERSONAL_LIST_NOT_FOUND: '個人リストが見つかりません',
  GROUP_LIST_NOT_FOUND: 'グループリストが見つかりません',
} as const;

export class InMemoryListRepository implements ListRepository {
  private readonly personalLists = new Map<string, PersonalList[]>();
  private readonly groupLists = new Map<string, GroupList[]>();

  public async getPersonalListsByUserId(userId: string): Promise<PersonalList[]> {
    const lists = this.personalLists.get(userId) ?? [];
    return lists.map((list) => ({ ...list }));
  }

  public async getPersonalListById(userId: string, listId: string): Promise<PersonalList | null> {
    const list = (this.personalLists.get(userId) ?? []).find((item) => item.listId === listId);
    return list ? { ...list } : null;
  }

  public async createPersonalList(input: CreatePersonalListInput): Promise<PersonalList> {
    const now = new Date().toISOString();
    const list: PersonalList = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    const lists = this.personalLists.get(input.userId) ?? [];
    this.personalLists.set(input.userId, [...lists, list]);

    return { ...list };
  }

  public async updatePersonalList(
    userId: string,
    listId: string,
    updates: UpdatePersonalListInput
  ): Promise<PersonalList> {
    const lists = this.personalLists.get(userId) ?? [];
    const targetIndex = lists.findIndex((item) => item.listId === listId);

    if (targetIndex === -1) {
      throw new Error(ERROR_MESSAGES.PERSONAL_LIST_NOT_FOUND);
    }

    const updatedList: PersonalList = {
      ...lists[targetIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const updatedLists = [...lists];
    updatedLists[targetIndex] = updatedList;
    this.personalLists.set(userId, updatedLists);

    return { ...updatedList };
  }

  public async deletePersonalList(userId: string, listId: string): Promise<void> {
    const lists = this.personalLists.get(userId) ?? [];
    const remainingLists = lists.filter((item) => item.listId !== listId);
    this.personalLists.set(userId, remainingLists);
  }

  public async getGroupListsByGroupId(groupId: string): Promise<GroupList[]> {
    const lists = this.groupLists.get(groupId) ?? [];
    return lists.map((list) => ({ ...list }));
  }

  public async getGroupListById(groupId: string, listId: string): Promise<GroupList | null> {
    const list = (this.groupLists.get(groupId) ?? []).find((item) => item.listId === listId);
    return list ? { ...list } : null;
  }

  public async createGroupList(input: CreateGroupListInput): Promise<GroupList> {
    const now = new Date().toISOString();
    const list: GroupList = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    const lists = this.groupLists.get(input.groupId) ?? [];
    this.groupLists.set(input.groupId, [...lists, list]);

    return { ...list };
  }

  public async updateGroupList(
    groupId: string,
    listId: string,
    updates: UpdateGroupListInput
  ): Promise<GroupList> {
    const lists = this.groupLists.get(groupId) ?? [];
    const targetIndex = lists.findIndex((item) => item.listId === listId);

    if (targetIndex === -1) {
      throw new Error(ERROR_MESSAGES.GROUP_LIST_NOT_FOUND);
    }

    const updatedList: GroupList = {
      ...lists[targetIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const updatedLists = [...lists];
    updatedLists[targetIndex] = updatedList;
    this.groupLists.set(groupId, updatedLists);

    return { ...updatedList };
  }

  public async deleteGroupList(groupId: string, listId: string): Promise<void> {
    const lists = this.groupLists.get(groupId) ?? [];
    const remainingLists = lists.filter((item) => item.listId !== listId);
    this.groupLists.set(groupId, remainingLists);
  }
}
