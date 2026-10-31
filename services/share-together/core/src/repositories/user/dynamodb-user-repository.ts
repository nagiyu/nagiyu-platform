import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, batchGetAll, toDatabaseError, type EntityStore } from '@nagiyu/aws';
import type { CreateUserInput, UpdateUserInput, User } from '../../types/index.js';
import type { UserRepository } from './user-repository.interface.js';
import {
  UserMapper,
  USER_EMAIL_INDEX_NAME,
  buildUserEmailGsi2Pk,
  type UserKey,
} from './user-mapper.js';

/**
 * DynamoDB User Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、GSI の Query とバッチ取得だけを自前で持つ。
 */
export class DynamoDBUserRepository implements UserRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new UserMapper();
  private readonly entityStore: EntityStore<User, UserKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  public async getById(userId: string): Promise<User | null> {
    return this.entityStore.get({ userId });
  }

  public async getByEmail(email: string): Promise<User | null> {
    let items: Record<string, unknown>[];
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: USER_EMAIL_INDEX_NAME,
          KeyConditionExpression: '#gsi2pk = :gsi2pk',
          ExpressionAttributeNames: {
            '#gsi2pk': 'GSI2PK',
          },
          ExpressionAttributeValues: {
            ':gsi2pk': buildUserEmailGsi2Pk(email),
          },
          Limit: 1,
        })
      );
      items = result.Items ?? [];
    } catch (error) {
      throw toDatabaseError(error);
    }

    return items.length === 0 ? null : this.mapper.toEntity(items[0]);
  }

  public async batchGetByIds(userIds: string[]): Promise<User[]> {
    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length === 0) {
      return [];
    }

    let items: Record<string, unknown>[];
    try {
      items = await batchGetAll(
        this.docClient,
        this.tableName,
        uniqueUserIds.map((userId) => this.mapper.buildKeys({ userId }))
      );
    } catch (error) {
      throw toDatabaseError(error);
    }

    return items.map((item) => this.mapper.toEntity(item));
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
