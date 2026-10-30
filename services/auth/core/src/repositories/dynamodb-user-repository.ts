import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DynamoDBEntityStore,
  getDynamoDBDocumentClient,
  getTableName,
  toDatabaseError,
  scanPage,
  type EntityStore,
  type PaginatedResult,
  type PaginationOptions,
} from '@nagiyu/aws';
import type { User } from '@nagiyu/common';
import { randomUUID } from 'node:crypto';
import { UserMapper, type UserKey } from '../mappers/user.mapper';
import type { UpdateUserInput, UpsertUserInput, UserRepository } from './user-repository';

/**
 * DynamoDB User Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、GSI の Query と Scan だけを自前で持つ
 */
export class DynamoDBUserRepository implements UserRepository {
  private readonly dynamoDb: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new UserMapper();
  private readonly entityStore: EntityStore<User, UserKey>;

  constructor(docClient?: DynamoDBDocumentClient, tableName?: string) {
    this.dynamoDb = docClient ?? getDynamoDBDocumentClient();
    this.tableName = tableName ?? getTableName('nagiyu-auth-users-dev');
    this.entityStore = new DynamoDBEntityStore(this.dynamoDb, this.tableName, this.mapper);
  }

  public async getUserByGoogleId(googleId: string): Promise<User | null> {
    try {
      const result = await this.dynamoDb.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'googleId-index',
          KeyConditionExpression: 'googleId = :googleId',
          ExpressionAttributeValues: {
            ':googleId': googleId,
          },
        })
      );
      const item = result.Items?.[0];
      return item ? this.mapper.toEntity(item) : null;
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  public async getUserById(userId: string): Promise<User | null> {
    return this.entityStore.get({ userId });
  }

  public async listUsers(options?: PaginationOptions): Promise<PaginatedResult<User>> {
    try {
      const page = await scanPage(
        this.dynamoDb,
        { TableName: this.tableName },
        { limit: options?.limit || 100, cursor: options?.cursor }
      );

      return {
        items: page.items.map((item) => this.mapper.toEntity(item)),
        nextCursor: page.nextCursor,
        count: page.count,
      };
    } catch (error) {
      throw toDatabaseError(error);
    }
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
