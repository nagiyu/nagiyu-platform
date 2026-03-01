import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CreateUserInput, UpdateUserInput, User } from '../../types/index.js';
import type { UserRepository } from './user-repository.interface.js';

const USER_META_SK = '#META#';
const GSI2_INDEX_NAME = 'GSI2';

const ERROR_MESSAGES = {
  INVALID_USER_DATA: 'ユーザー情報の形式が不正です',
  NOT_IMPLEMENTED: 'この操作は未実装です',
} as const;

export class DynamoDBUserRepository implements UserRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  public async getById(userId: string): Promise<User | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: this.buildUserPk(userId),
          SK: USER_META_SK,
        },
      })
    );

    if (!result.Item) {
      return null;
    }

    return this.toUser(result.Item as Record<string, unknown>);
  }

  public async getByEmail(email: string): Promise<User | null> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: GSI2_INDEX_NAME,
        KeyConditionExpression: '#gsi2pk = :gsi2pk',
        ExpressionAttributeNames: {
          '#gsi2pk': 'GSI2PK',
        },
        ExpressionAttributeValues: {
          ':gsi2pk': this.buildEmailGsiPk(email),
        },
        Limit: 1,
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return this.toUser(result.Items[0] as Record<string, unknown>);
  }

  public async create(_input: CreateUserInput): Promise<User> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async update(_userId: string, _updates: UpdateUserInput): Promise<User> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async delete(_userId: string): Promise<void> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  private buildUserPk(userId: string): string {
    return `USER#${userId}`;
  }

  private buildEmailGsiPk(email: string): string {
    return `EMAIL#${email}`;
  }

  private toUser(item: Record<string, unknown>): User {
    const userId = item['userId'];
    const email = item['email'];
    const name = item['name'];
    const defaultListId = item['defaultListId'];
    const createdAt = item['createdAt'];
    const updatedAt = item['updatedAt'];
    const image = item['image'];

    if (
      typeof userId !== 'string' ||
      typeof email !== 'string' ||
      typeof name !== 'string' ||
      typeof defaultListId !== 'string' ||
      typeof createdAt !== 'string' ||
      typeof updatedAt !== 'string'
    ) {
      throw new Error(ERROR_MESSAGES.INVALID_USER_DATA);
    }

    if (image !== undefined && typeof image !== 'string') {
      throw new Error(ERROR_MESSAGES.INVALID_USER_DATA);
    }

    return {
      userId,
      email,
      name,
      image,
      defaultListId,
      createdAt,
      updatedAt,
    };
  }
}
