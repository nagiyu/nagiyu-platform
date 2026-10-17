import {
  InMemoryEntityStore,
  InMemorySingleTableStore,
  decodeCursor,
  encodeCursor,
  type EntityStore,
} from '@nagiyu/aws';
import type { User } from '@nagiyu/common';
import { randomUUID } from 'node:crypto';
import { UserMapper, type UserKey } from '../mappers/user.mapper';
import type {
  ListUsersResult,
  UpdateUserInput,
  UpsertUserInput,
  UserRepository,
} from './user-repository';

/**
 * InMemory User Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、GSI の近似クエリと Scan だけを自前で持つ。
 * 開発・テスト環境で使用する。
 */
export class InMemoryUserRepository implements UserRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new UserMapper();
  private readonly entityStore: EntityStore<User, UserKey>;

  constructor(store: InMemorySingleTableStore = new InMemorySingleTableStore()) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  public async getUserByGoogleId(googleId: string): Promise<User | null> {
    // InMemory は GSI を持たないため、全件スキャンの絞り込みで近似する
    const result = this.store.queryByAttribute({
      attributeName: 'googleId',
      attributeValue: googleId,
    });
    const item = result.items[0];
    return item ? this.mapper.toEntity(item) : null;
  }

  public async getUserById(userId: string): Promise<User | null> {
    return this.entityStore.get({ userId });
  }

  public async listUsers(
    limit: number = 100,
    lastEvaluatedKey?: Record<string, unknown>
  ): Promise<ListUsersResult> {
    const result = this.store.scan({ limit, cursor: encodeCursor(lastEvaluatedKey) });
    return {
      users: result.items.map((item) => this.mapper.toEntity(item)),
      lastEvaluatedKey: decodeCursor(result.nextCursor),
    };
  }

  public async upsertUser(input: UpsertUserInput): Promise<User> {
    const existingUser = await this.getUserByGoogleId(input.googleId);

    if (existingUser) {
      // Google が picture を返さなくなったときは、古い画像を残さず消す
      return this.entityStore.update(
        { userId: existingUser.userId },
        { name: input.name, picture: input.picture ?? null }
      );
    }

    const now = Date.now();
    // updatedAt は store が書き込み時に現在時刻で上書きする。Entity 型上は必須のため値だけ渡す。
    return this.entityStore.create({
      userId: randomUUID(),
      googleId: input.googleId,
      email: input.email,
      name: input.name,
      ...(input.picture !== undefined ? { picture: input.picture } : {}),
      roles: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  public async updateUser(userId: string, input: UpdateUserInput): Promise<User> {
    return this.entityStore.update({ userId }, input);
  }

  public async deleteUser(userId: string): Promise<void> {
    await this.entityStore.delete({ userId });
  }

  public async assignRoles(userId: string, roles: string[]): Promise<User> {
    return this.updateUser(userId, { roles });
  }

  public async updateLastLogin(userId: string): Promise<void> {
    await this.entityStore.update({ userId }, { lastLoginAt: Date.now() });
  }
}
