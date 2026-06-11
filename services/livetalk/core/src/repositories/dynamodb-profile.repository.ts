import { GetCommand, PutCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
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
 * upsert は Put 1 回で十分なため、conditional 系は使わずに最新値で上書きする。
 * 既存値の `CreatedAt` は維持するため Get → Put の 2 段書きとする。
 */
export class DynamoDBProfileRepository implements ProfileRepository {
  private readonly mapper: ProfileMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly nowMs: () => number;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.nowMs = nowMs;
    this.mapper = new ProfileMapper();
  }

  public async getById(key: ProfileKey): Promise<ProfileEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys(key);
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );
      if (!result.Item) return null;
      return this.mapper.toEntity(result.Item as unknown as DynamoDBItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async listAllUserIds(): Promise<string[]> {
    const userIds: string[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    try {
      do {
        const result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            IndexName: PROFILE_GSI_INDEX_NAME,
            KeyConditionExpression: '#gsi1pk = :pk',
            ExpressionAttributeNames: { '#gsi1pk': 'GSI1PK' },
            ExpressionAttributeValues: { ':pk': buildProfileGSI1PK() },
            ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
          })
        );
        for (const item of result.Items ?? []) {
          // KEYS_ONLY 射影のため GSI1SK（生の UserID）から読み取る
          if (typeof item.GSI1SK === 'string' && item.GSI1SK) {
            userIds.push(item.GSI1SK);
          }
        }
        lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastEvaluatedKey !== undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }

    return userIds;
  }

  public async upsert(
    input: CreateProfileInput,
    updates: UpdateProfileInput = {}
  ): Promise<ProfileEntity> {
    const now = this.nowMs();
    const existing = await this.getById({ userId: input.UserID });

    const merged: ProfileEntity = {
      UserID: input.UserID,
      LastActiveAt: updates.LastActiveAt ?? input.LastActiveAt ?? now,
      CreatedAt: existing?.CreatedAt ?? now,
      UpdatedAt: now,
      ...(updates.Consents !== undefined
        ? { Consents: { ...existing?.Consents, ...updates.Consents } }
        : existing?.Consents !== undefined
          ? { Consents: existing.Consents }
          : {}),
    };

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.mapper.toItem(merged),
        })
      );
      return merged;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
