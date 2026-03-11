import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { CreateUserInput, UpdateUserInput, User } from '../../types/index.js';
import type { UserRepository } from './user-repository.interface.js';

const USER_META_SK = '#META#';
const GSI2_INDEX_NAME = 'GSI2';

const ERROR_MESSAGES = {
  INVALID_USER_DATA: 'ユーザー情報の形式が不正です',
  USER_ALREADY_EXISTS: 'ユーザーは既に存在します',
  USER_NOT_FOUND: 'ユーザーが見つかりません',
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

  public async create(input: CreateUserInput): Promise<User> {
    const now = new Date().toISOString();
    const item = {
      PK: this.buildUserPk(input.userId),
      SK: USER_META_SK,
      GSI2PK: this.buildEmailGsiPk(input.email),
      userId: input.userId,
      email: input.email,
      name: input.name,
      image: input.image,
      defaultListId: input.defaultListId,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        })
      );
    } catch (error) {
      if (this.isConditionalCheckFailed(error)) {
        throw new Error(ERROR_MESSAGES.USER_ALREADY_EXISTS);
      }
      throw error;
    }

    return this.toUser(item);
  }

  public async update(userId: string, updates: UpdateUserInput): Promise<User> {
    const now = new Date().toISOString();
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, unknown> = { ':updatedAt': now };
    const setExpressions: string[] = ['#updatedAt = :updatedAt'];

    if (updates.email !== undefined) {
      names['#email'] = 'email';
      values[':email'] = updates.email;
      setExpressions.push('#email = :email');

      names['#gsi2pk'] = 'GSI2PK';
      values[':gsi2pk'] = this.buildEmailGsiPk(updates.email);
      setExpressions.push('#gsi2pk = :gsi2pk');
    }

    if (updates.name !== undefined) {
      names['#name'] = 'name';
      values[':name'] = updates.name;
      setExpressions.push('#name = :name');
    }

    if (updates.image !== undefined) {
      names['#image'] = 'image';
      values[':image'] = updates.image;
      setExpressions.push('#image = :image');
    }

    if (updates.defaultListId !== undefined) {
      names['#defaultListId'] = 'defaultListId';
      values[':defaultListId'] = updates.defaultListId;
      setExpressions.push('#defaultListId = :defaultListId');
    }

    let result;
    try {
      result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            PK: this.buildUserPk(userId),
            SK: USER_META_SK,
          },
          UpdateExpression: `SET ${setExpressions.join(', ')}`,
          ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: 'ALL_NEW',
        })
      );
    } catch (error) {
      if (this.isConditionalCheckFailed(error)) {
        throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
      }
      throw error;
    }

    if (!result.Attributes) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    return this.toUser(result.Attributes as Record<string, unknown>);
  }

  public async delete(userId: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: this.buildUserPk(userId),
          SK: USER_META_SK,
        },
      })
    );
  }

  private buildUserPk(userId: string): string {
    return `USER#${userId}`;
  }

  private buildEmailGsiPk(email: string): string {
    return `EMAIL#${email}`;
  }

  private isConditionalCheckFailed(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'ConditionalCheckFailedException'
    );
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
