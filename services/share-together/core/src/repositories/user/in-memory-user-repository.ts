import { InMemoryEntityStore, InMemorySingleTableStore, type EntityStore } from '@nagiyu/aws';
import type { CreateUserInput, UpdateUserInput, User } from '../../types/index.js';
import type { UserRepository } from './user-repository.interface.js';
import { UserMapper, buildUserEmailGsi2Pk, type UserKey } from './user-mapper.js';

/**
 * InMemory User Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、GSI の近似クエリとバッチ取得だけを自前で持つ。
 * テスト環境で使用する。
 */
export class InMemoryUserRepository implements UserRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new UserMapper();
  private readonly entityStore: EntityStore<User, UserKey>;

  constructor(store: InMemorySingleTableStore = new InMemorySingleTableStore()) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  public async getById(userId: string): Promise<User | null> {
    return this.entityStore.get({ userId });
  }

  public async getByEmail(email: string): Promise<User | null> {
    const result = this.store.queryByAttribute(
      {
        attributeName: 'GSI2PK',
        attributeValue: buildUserEmailGsi2Pk(email),
      },
      { limit: 1 }
    );

    return result.items.length === 0 ? null : this.mapper.toEntity(result.items[0]);
  }

  public async batchGetByIds(userIds: string[]): Promise<User[]> {
    const users: User[] = [];
    for (const userId of new Set(userIds)) {
      const item = this.store.getByKey(this.mapper.buildKeys({ userId }));
      if (item) {
        users.push(this.mapper.toEntity(item));
      }
    }
    return users;
  }

  public async create(input: CreateUserInput): Promise<User> {
    return this.entityStore.create(input);
  }

  public async update(userId: string, updates: UpdateUserInput): Promise<User> {
    return this.entityStore.update({ userId }, updates);
  }

  public async delete(userId: string): Promise<void> {
    await this.entityStore.delete({ userId });
  }
}
