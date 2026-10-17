import { InMemoryEntityStore, InMemorySingleTableStore, type EntityStore } from '@nagiyu/aws';
import type {
  CreateGroupListInput,
  CreatePersonalListInput,
  GroupList,
  PersonalList,
  UpdateGroupListInput,
  UpdatePersonalListInput,
} from '../../types/index.js';
import type { ListRepository } from './list-repository.interface.js';
import {
  PersonalListMapper,
  PERSONAL_LIST_SK_PREFIX,
  buildPersonalListPk,
  type PersonalListKey,
} from './personal-list-mapper.js';
import {
  GroupListMapper,
  GROUP_LIST_SK_PREFIX,
  buildGroupListPk,
  type GroupListKey,
} from './group-list-mapper.js';

/**
 * InMemory List Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、一覧の Query だけを自前で持つ。
 * テスト環境で使用する。
 */
export class InMemoryListRepository implements ListRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly personalMapper = new PersonalListMapper();
  private readonly groupMapper = new GroupListMapper();
  private readonly personalStore: EntityStore<PersonalList, PersonalListKey>;
  private readonly groupStore: EntityStore<GroupList, GroupListKey>;

  constructor(store: InMemorySingleTableStore = new InMemorySingleTableStore()) {
    this.store = store;
    this.personalStore = new InMemoryEntityStore(store, this.personalMapper);
    this.groupStore = new InMemoryEntityStore(store, this.groupMapper);
  }

  public async getPersonalListsByUserId(userId: string): Promise<PersonalList[]> {
    return this.queryByPrefix(buildPersonalListPk(userId), PERSONAL_LIST_SK_PREFIX).map((item) =>
      this.personalMapper.toEntity(item)
    );
  }

  public async getPersonalListById(userId: string, listId: string): Promise<PersonalList | null> {
    return this.personalStore.get({ userId, listId });
  }

  public async createPersonalList(input: CreatePersonalListInput): Promise<PersonalList> {
    const now = Date.now();
    // updatedAt は store が書き込み時に現在時刻で上書きする。Entity 型上は必須のため値だけ渡す。
    return this.personalStore.create({ ...input, createdAt: now, updatedAt: now });
  }

  public async updatePersonalList(
    userId: string,
    listId: string,
    updates: UpdatePersonalListInput
  ): Promise<PersonalList> {
    return this.personalStore.update({ userId, listId }, updates);
  }

  public async deletePersonalList(userId: string, listId: string): Promise<void> {
    await this.personalStore.deleteIfExists({ userId, listId });
  }

  public async getGroupListsByGroupId(groupId: string): Promise<GroupList[]> {
    return this.queryByPrefix(buildGroupListPk(groupId), GROUP_LIST_SK_PREFIX).map((item) =>
      this.groupMapper.toEntity(item)
    );
  }

  public async getGroupListById(groupId: string, listId: string): Promise<GroupList | null> {
    return this.groupStore.get({ groupId, listId });
  }

  public async createGroupList(input: CreateGroupListInput): Promise<GroupList> {
    const now = Date.now();
    return this.groupStore.create({ ...input, createdAt: now, updatedAt: now });
  }

  public async updateGroupList(
    groupId: string,
    listId: string,
    updates: UpdateGroupListInput
  ): Promise<GroupList> {
    return this.groupStore.update({ groupId, listId }, updates);
  }

  public async deleteGroupList(groupId: string, listId: string): Promise<void> {
    await this.groupStore.deleteIfExists({ groupId, listId });
  }

  private queryByPrefix(pk: string, skPrefix: string): Record<string, unknown>[] {
    // 既定の件数上限で打ち切られないよう、実 DynamoDB の全ページ取得に合わせて上限を外す
    const { items } = this.store.query(
      { pk, sk: { operator: 'begins_with', value: skPrefix } },
      { limit: Number.MAX_SAFE_INTEGER }
    );
    return items;
  }
}
