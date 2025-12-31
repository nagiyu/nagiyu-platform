import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoDb, USERS_TABLE_NAME } from '../dynamodb-client';
import type { User, CreateUserInput, UpdateUserInput } from '../types';
import { randomUUID } from 'crypto';

const ERROR_MESSAGES = {
  USER_NOT_FOUND: 'ユーザーが見つかりません',
} as const;

/**
 * ユーザーが見つからない場合のエラー
 */
export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`${ERROR_MESSAGES.USER_NOT_FOUND}: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

export class DynamoDBUserRepository {
  /**
   * Google ID でユーザーを取得 (GSI 使用)
   */
  async getUserByGoogleId(googleId: string): Promise<User | null> {
    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: USERS_TABLE_NAME,
        IndexName: 'googleId-index',
        KeyConditionExpression: 'googleId = :googleId',
        ExpressionAttributeValues: {
          ':googleId': googleId,
        },
      })
    );

    return (result.Items?.[0] as User) || null;
  }

  /**
   * User ID でユーザーを取得
   */
  async getUserById(userId: string): Promise<User | null> {
    const result = await dynamoDb.send(
      new GetCommand({
        TableName: USERS_TABLE_NAME,
        Key: { userId },
      })
    );

    return (result.Item as User) || null;
  }

  /**
   * 全ユーザーを取得 (ページネーション対応)
   */
  async listUsers(
    limit: number = 100,
    lastEvaluatedKey?: Record<string, unknown>
  ): Promise<{ users: User[]; lastEvaluatedKey?: Record<string, unknown> }> {
    const result = await dynamoDb.send(
      new ScanCommand({
        TableName: USERS_TABLE_NAME,
        Limit: limit,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    return {
      users: (result.Items as User[]) || [],
      lastEvaluatedKey: result.LastEvaluatedKey,
    };
  }

  /**
   * ユーザーを作成または更新 (OAuth サインイン時)
   */
  async upsertUser(input: CreateUserInput): Promise<User> {
    const existingUser = await this.getUserByGoogleId(input.googleId);

    if (existingUser) {
      // 既存ユーザーの場合は名前と画像を更新
      const updatedUser: User = {
        ...existingUser,
        name: input.name,
        picture: input.picture,
        updatedAt: new Date().toISOString(),
      };

      await dynamoDb.send(
        new PutCommand({
          TableName: USERS_TABLE_NAME,
          Item: updatedUser,
        })
      );

      return updatedUser;
    } else {
      // 新規ユーザーの場合
      const newUser: User = {
        userId: randomUUID(),
        googleId: input.googleId,
        email: input.email,
        name: input.name,
        picture: input.picture,
        roles: [], // 初期状態ではロールなし
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await dynamoDb.send(
        new PutCommand({
          TableName: USERS_TABLE_NAME,
          Item: newUser,
        })
      );

      return newUser;
    }
  }

  /**
   * ユーザー情報を更新
   */
  async updateUser(userId: string, input: UpdateUserInput): Promise<User> {
    const existingUser = await this.getUserById(userId);
    if (!existingUser) {
      throw new UserNotFoundError(userId);
    }

    const updatedUser: User = {
      ...existingUser,
      ...input,
      updatedAt: new Date().toISOString(),
    };

    await dynamoDb.send(
      new PutCommand({
        TableName: USERS_TABLE_NAME,
        Item: updatedUser,
      })
    );

    return updatedUser;
  }

  /**
   * ユーザーを削除
   */
  async deleteUser(userId: string): Promise<void> {
    await dynamoDb.send(
      new DeleteCommand({
        TableName: USERS_TABLE_NAME,
        Key: { userId },
      })
    );
  }

  /**
   * ユーザーにロールを割り当て
   */
  async assignRoles(userId: string, roles: string[]): Promise<User> {
    return this.updateUser(userId, { roles });
  }

  /**
   * 最終ログイン日時を更新
   */
  async updateLastLogin(userId: string): Promise<void> {
    const existingUser = await this.getUserById(userId);
    if (!existingUser) {
      throw new UserNotFoundError(userId);
    }

    const updatedUser: User = {
      ...existingUser,
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await dynamoDb.send(
      new PutCommand({
        TableName: USERS_TABLE_NAME,
        Item: updatedUser,
      })
    );
  }
}
