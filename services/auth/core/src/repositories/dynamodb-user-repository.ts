import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getDynamoDBDocumentClient, getTableName } from '@nagiyu/aws';
import type { User } from '@nagiyu/common';
import { randomUUID } from 'node:crypto';
import {
  UserNotFoundError,
  type ListUsersResult,
  type UpdateUserInput,
  type UpsertUserInput,
  type UserRepository,
} from './user-repository';

export class DynamoDBUserRepository implements UserRepository {
  private readonly dynamoDb: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient?: DynamoDBDocumentClient, tableName?: string) {
    this.dynamoDb = docClient ?? getDynamoDBDocumentClient();
    this.tableName = tableName ?? getTableName('nagiyu-auth-users-dev');
  }

  public async getUserByGoogleId(googleId: string): Promise<User | null> {
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

    return (result.Items?.[0] as User) || null;
  }

  public async getUserById(userId: string): Promise<User | null> {
    const result = await this.dynamoDb.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { userId },
      })
    );

    return (result.Item as User) || null;
  }

  public async listUsers(
    limit: number = 100,
    lastEvaluatedKey?: Record<string, unknown>
  ): Promise<ListUsersResult> {
    const result = await this.dynamoDb.send(
      new ScanCommand({
        TableName: this.tableName,
        Limit: limit,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    return {
      users: (result.Items as User[]) || [],
      lastEvaluatedKey: result.LastEvaluatedKey,
    };
  }

  public async upsertUser(input: UpsertUserInput): Promise<User> {
    const existingUser = await this.getUserByGoogleId(input.googleId);

    if (existingUser) {
      const updatedUser: User = {
        ...existingUser,
        name: input.name,
        picture: input.picture,
        updatedAt: new Date().toISOString(),
      };

      await this.dynamoDb.send(
        new PutCommand({
          TableName: this.tableName,
          Item: updatedUser,
        })
      );

      return updatedUser;
    }

    const newUser: User = {
      userId: randomUUID(),
      googleId: input.googleId,
      email: input.email,
      name: input.name,
      picture: input.picture,
      roles: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.dynamoDb.send(
      new PutCommand({
        TableName: this.tableName,
        Item: newUser,
      })
    );

    return newUser;
  }

  public async updateUser(userId: string, input: UpdateUserInput): Promise<User> {
    const existingUser = await this.getUserById(userId);
    if (!existingUser) {
      throw new UserNotFoundError(userId);
    }

    const updatedUser: User = {
      ...existingUser,
      ...input,
      updatedAt: new Date().toISOString(),
    };

    await this.dynamoDb.send(
      new PutCommand({
        TableName: this.tableName,
        Item: updatedUser,
      })
    );

    return updatedUser;
  }

  public async deleteUser(userId: string): Promise<void> {
    await this.dynamoDb.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { userId },
      })
    );
  }

  public async assignRoles(userId: string, roles: string[]): Promise<User> {
    return this.updateUser(userId, { roles });
  }

  public async updateLastLogin(userId: string): Promise<void> {
    const existingUser = await this.getUserById(userId);
    if (!existingUser) {
      throw new UserNotFoundError(userId);
    }

    const updatedUser: User = {
      ...existingUser,
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.dynamoDb.send(
      new PutCommand({
        TableName: this.tableName,
        Item: updatedUser,
      })
    );
  }
}
