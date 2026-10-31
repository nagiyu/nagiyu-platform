import { InMemoryEntityStore, InMemorySingleTableStore, type EntityStore } from '@nagiyu/aws';
import type {
  CreateGroupMembershipInput,
  GroupMembership,
  UpdateGroupMembershipInput,
} from '../../types/index.js';
import type { MembershipRepository } from './membership-repository.interface.js';
import {
  GroupMembershipMapper,
  MEMBER_SK_PREFIX,
  buildMembershipGsi1Pk,
  buildMembershipPk,
  type MembershipKey,
} from './membership-mapper.js';

/**
 * InMemory Membership Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、一覧の Query と一括削除だけを自前で持つ。
 * ユーザー単位の一覧は GSI1 を共有ストアの属性クエリで近似する。
 * テスト環境で使用する。
 */
export class InMemoryMembershipRepository implements MembershipRepository {
  private readonly tableStore: InMemorySingleTableStore;
  private readonly mapper = new GroupMembershipMapper();
  private readonly store: EntityStore<GroupMembership, MembershipKey>;

  constructor(store: InMemorySingleTableStore = new InMemorySingleTableStore()) {
    this.tableStore = store;
    this.store = new InMemoryEntityStore(store, this.mapper);
  }

  public async getById(groupId: string, userId: string): Promise<GroupMembership | null> {
    return this.store.get({ groupId, userId });
  }

  public async getByGroupId(groupId: string): Promise<GroupMembership[]> {
    return this.queryByGroupId(groupId).map((item) => this.mapper.toEntity(item));
  }

  public async getByUserId(userId: string): Promise<GroupMembership[]> {
    return this.queryByUserId(userId).map((item) => this.mapper.toEntity(item));
  }

  public async getPendingInvitationsByUserId(userId: string): Promise<GroupMembership[]> {
    // 旧形式と新形式で属性名が違うため、Entity に変換してから絞り込む
    return (await this.getByUserId(userId)).filter((membership) => membership.status === 'PENDING');
  }

  public async create(input: CreateGroupMembershipInput): Promise<GroupMembership> {
    return this.store.create(input);
  }

  public async update(
    groupId: string,
    userId: string,
    updates: UpdateGroupMembershipInput
  ): Promise<GroupMembership> {
    return this.store.update({ groupId, userId }, updates);
  }

  public async delete(groupId: string, userId: string): Promise<void> {
    await this.store.delete({ groupId, userId });
  }

  public async deleteByGroupId(groupId: string): Promise<void> {
    for (const item of this.queryByGroupId(groupId)) {
      this.tableStore.delete(String(item['PK']), String(item['SK']));
    }
  }

  private queryByGroupId(groupId: string): Record<string, unknown>[] {
    const items = this.tableStore.queryAll({
      pk: buildMembershipPk(groupId),
      sk: { operator: 'begins_with', value: MEMBER_SK_PREFIX },
    });
    return items;
  }

  private queryByUserId(userId: string): Record<string, unknown>[] {
    const items = this.tableStore.queryAllByAttribute({
      attributeName: 'GSI1PK',
      attributeValue: buildMembershipGsi1Pk(userId),
      gsiSortKeyAttributeName: 'GSI1SK',
    });
    return items;
  }
}
