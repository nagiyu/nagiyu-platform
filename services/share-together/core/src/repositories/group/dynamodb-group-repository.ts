import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, batchGetAll, toDatabaseError, type EntityStore } from '@nagiyu/aws';
import type { CreateGroupInput, Group, UpdateGroupInput } from '../../types/index.js';
import type { GroupRepository } from './group-repository.interface.js';
import { GroupMapper, type GroupKey } from './group-mapper.js';

/**
 * DynamoDB Group Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、バッチ取得だけを自前で持つ。
 */
export class DynamoDBGroupRepository implements GroupRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new GroupMapper();
  private readonly entityStore: EntityStore<Group, GroupKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  public async getById(groupId: string): Promise<Group | null> {
    return this.entityStore.get({ groupId });
  }

  public async batchGetByIds(groupIds: string[]): Promise<Group[]> {
    const uniqueGroupIds = [...new Set(groupIds)];
    if (uniqueGroupIds.length === 0) {
      return [];
    }

    let items: Record<string, unknown>[];
    try {
      items = await batchGetAll(
        this.docClient,
        this.tableName,
        uniqueGroupIds.map((groupId) => this.mapper.buildKeys({ groupId }))
      );
    } catch (error) {
      throw toDatabaseError(error);
    }

    return items.map((item) => this.mapper.toEntity(item));
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
