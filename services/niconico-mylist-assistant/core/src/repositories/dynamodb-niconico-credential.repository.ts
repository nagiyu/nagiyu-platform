/**
 * NiconicoMylistAssistant Core - DynamoDB NiconicoCredential Repository
 *
 * DynamoDB を使用した NiconicoCredentialRepository の実装
 */

import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import { toErrorMessage } from '@nagiyu/common';
import type { NiconicoCredentialRepository } from './niconico-credential.repository.interface.js';
import type {
  NiconicoCredentialEntity,
  CreateNiconicoCredentialInput,
} from '../entities/niconico-credential.entity.js';
import { NiconicoCredentialMapper } from '../mappers/niconico-credential.mapper.js';

/**
 * DynamoDB NiconicoCredential Repository
 *
 * ニコニコ資格情報（user_session）を DynamoDB に保存・取得・削除する
 */
export class DynamoDBNiconicoCredentialRepository implements NiconicoCredentialRepository {
  private readonly mapper: NiconicoCredentialMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new NiconicoCredentialMapper();
  }

  /**
   * ユーザーID でニコニコ資格情報を取得
   */
  public async getByUserId(userId: string): Promise<NiconicoCredentialEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId });

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );

      if (!result.Item) {
        return null;
      }

      return this.mapper.toEntity(result.Item as DynamoDBItem);
    } catch (error) {
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * ニコニコ資格情報を保存（upsert）
   */
  public async upsert(input: CreateNiconicoCredentialInput): Promise<NiconicoCredentialEntity> {
    try {
      const item = this.mapper.toItem(input);

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
        })
      );

      return input;
    } catch (error) {
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * ニコニコ資格情報を削除
   */
  public async delete(userId: string): Promise<void> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId });

      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );
    } catch (error) {
      const message = toErrorMessage(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
