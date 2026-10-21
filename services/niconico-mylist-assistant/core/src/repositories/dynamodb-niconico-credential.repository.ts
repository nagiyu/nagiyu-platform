/**
 * NiconicoMylistAssistant Core - DynamoDB NiconicoCredential Repository
 *
 * DynamoDB を使用した NiconicoCredentialRepository の実装
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, type EntityStore } from '@nagiyu/aws';
import type { NiconicoCredentialRepository } from './niconico-credential.repository.interface.js';
import type {
  NiconicoCredentialEntity,
  NiconicoCredentialKey,
  CreateNiconicoCredentialInput,
} from '../entities/niconico-credential.entity.js';
import { NiconicoCredentialMapper } from '../mappers/niconico-credential.mapper.js';

/**
 * DynamoDB NiconicoCredential Repository
 *
 * ニコニコ資格情報（user_session）の CRUD をすべて EntityStore に任せる
 */
export class DynamoDBNiconicoCredentialRepository implements NiconicoCredentialRepository {
  private readonly entityStore: EntityStore<NiconicoCredentialEntity, NiconicoCredentialKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.entityStore = new DynamoDBEntityStore(
      docClient,
      tableName,
      new NiconicoCredentialMapper()
    );
  }

  /**
   * ユーザーID でニコニコ資格情報を取得
   */
  public async getByUserId(userId: string): Promise<NiconicoCredentialEntity | null> {
    return this.entityStore.get({ userId });
  }

  /**
   * ニコニコ資格情報を保存（upsert）
   */
  public async upsert(input: CreateNiconicoCredentialInput): Promise<NiconicoCredentialEntity> {
    return this.entityStore.put(input);
  }

  /**
   * ニコニコ資格情報を削除
   */
  public async delete(userId: string): Promise<void> {
    await this.entityStore.delete({ userId });
  }

  /**
   * ニコニコ資格情報を削除する。対象がなくても成功する
   */
  public async deleteIfExists(userId: string): Promise<void> {
    await this.entityStore.deleteIfExists({ userId });
  }
}
