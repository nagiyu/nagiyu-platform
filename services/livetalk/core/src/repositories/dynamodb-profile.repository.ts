import { type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, queryAllItems, toDatabaseError, type EntityStore } from '@nagiyu/aws';
import type {
  CreateProfileInput,
  ProfileEntity,
  ProfileKey,
  UpdateProfileInput,
} from '../entities/profile.entity.js';
import { PROFILE_GSI_INDEX_NAME, buildProfileGSI1PK } from '../mappers/keys.js';
import { ProfileMapper } from '../mappers/profile.mapper.js';
import type { ProfileRepository } from './profile.repository.interface.js';

/**
 * DynamoDB Profile Repository。
 *
 * upsert は条件なしの置き換えで足りる。`createdAt` を保つため、書く前に既存を読む。
 * 単一アイテムの CRUD は EntityStore に任せ、GSI1 の列挙だけを自前で持つ。
 */
export class DynamoDBProfileRepository implements ProfileRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<ProfileEntity, ProfileKey>;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.nowMs = nowMs;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, new ProfileMapper(), {
      now: nowMs,
    });
  }

  public async getById(key: ProfileKey): Promise<ProfileEntity | null> {
    return this.entityStore.get(key);
  }

  public async listAllUserIds(): Promise<string[]> {
    const userIds: string[] = [];

    try {
      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        IndexName: PROFILE_GSI_INDEX_NAME,
        KeyConditionExpression: '#gsi1pk = :pk',
        ExpressionAttributeNames: { '#gsi1pk': 'GSI1PK' },
        ExpressionAttributeValues: { ':pk': buildProfileGSI1PK() },
      });
      for (const item of items) {
        // KEYS_ONLY 射影のため GSI1SK (生の UserID) から読み取る
        if (typeof item.GSI1SK === 'string' && item.GSI1SK) {
          userIds.push(item.GSI1SK);
        }
      }
    } catch (error) {
      throw toDatabaseError(error);
    }

    return userIds;
  }

  public async upsert(
    input: CreateProfileInput,
    updates: UpdateProfileInput = {}
  ): Promise<ProfileEntity> {
    const now = this.nowMs();
    const existing = await this.getById({ userId: input.userId });

    const merged: ProfileEntity = {
      userId: input.userId,
      lastActiveAt: updates.lastActiveAt ?? input.lastActiveAt ?? now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(updates.consents !== undefined
        ? { consents: { ...existing?.consents, ...updates.consents } }
        : existing?.consents !== undefined
          ? { consents: existing.consents }
          : {}),
    };
    return this.entityStore.put(merged);
  }
}
