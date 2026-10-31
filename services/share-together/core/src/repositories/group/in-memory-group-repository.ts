import { InMemoryEntityStore, InMemorySingleTableStore, type EntityStore } from '@nagiyu/aws';
import type { CreateGroupInput, Group, UpdateGroupInput } from '../../types/index.js';
import type { GroupRepository } from './group-repository.interface.js';
import { GroupMapper, type GroupKey } from './group-mapper.js';

/**
 * InMemory Group Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、バッチ取得だけを自前で持つ。
 * テスト環境で使用する。
 */
export class InMemoryGroupRepository implements GroupRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new GroupMapper();
  private readonly entityStore: EntityStore<Group, GroupKey>;

  constructor(store: InMemorySingleTableStore = new InMemorySingleTableStore()) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  public async getById(groupId: string): Promise<Group | null> {
    return this.entityStore.get({ groupId });
  }

  public async batchGetByIds(groupIds: string[]): Promise<Group[]> {
    const groups: Group[] = [];
    for (const groupId of new Set(groupIds)) {
      const item = this.store.getByKey(this.mapper.buildKeys({ groupId }));
      if (item) {
        groups.push(this.mapper.toEntity(item));
      }
    }
    return groups;
  }

  public async create(input: CreateGroupInput): Promise<Group> {
    return this.entityStore.create(input);
  }

  public async update(groupId: string, updates: UpdateGroupInput): Promise<Group> {
    return this.entityStore.update({ groupId }, updates);
  }

  public async delete(groupId: string): Promise<void> {
    await this.entityStore.delete({ groupId });
  }
}
