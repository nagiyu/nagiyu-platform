import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import type {
  CreateLifecycleInput,
  LifecycleEntity,
  LifecycleKey,
  UpdateLifecycleInput,
  UserActivityProfile,
} from '../entities/lifecycle.entity.js';
import { LIFECYCLE_DEFAULT_BEDTIME, LIFECYCLE_DEFAULT_WAKE_UP_TIME } from '../constants.js';
import { LifecycleMapper } from '../mappers/lifecycle.mapper.js';
import type { LifecycleRepository } from './lifecycle.repository.interface.js';

export class DynamoDBLifecycleRepository implements LifecycleRepository {
  private readonly mapper: LifecycleMapper;
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
    this.mapper = new LifecycleMapper();
  }

  public async get(key: LifecycleKey): Promise<LifecycleEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys(key);
      const result = await this.docClient.send(
        new GetCommand({ TableName: this.tableName, Key: { PK: pk, SK: sk } })
      );
      if (!result.Item) return null;
      return this.mapper.toEntity(result.Item as unknown as DynamoDBItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async upsert(
    input: CreateLifecycleInput,
    updates: UpdateLifecycleInput = {}
  ): Promise<LifecycleEntity> {
    const now = this.nowMs();
    const existing = await this.get({ userId: input.UserID, characterId: input.CharacterID });
    const entity: LifecycleEntity = {
      UserID: input.UserID,
      CharacterID: input.CharacterID,
      Bedtime: updates.Bedtime ?? input.Bedtime,
      WakeUpTime: updates.WakeUpTime ?? input.WakeUpTime,
      ...(existing?.UserActivityProfile !== undefined && {
        UserActivityProfile: existing.UserActivityProfile,
      }),
      CreatedAt: existing?.CreatedAt ?? now,
      UpdatedAt: now,
    };
    try {
      await this.docClient.send(
        new PutCommand({ TableName: this.tableName, Item: this.mapper.toItem(entity) })
      );
      return entity;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async updateUserActivityProfile(
    key: LifecycleKey,
    profile: UserActivityProfile
  ): Promise<LifecycleEntity> {
    const now = this.nowMs();
    const existing = await this.get(key);
    const entity: LifecycleEntity = {
      UserID: key.userId,
      CharacterID: key.characterId,
      Bedtime: existing?.Bedtime ?? LIFECYCLE_DEFAULT_BEDTIME,
      WakeUpTime: existing?.WakeUpTime ?? LIFECYCLE_DEFAULT_WAKE_UP_TIME,
      UserActivityProfile: profile,
      CreatedAt: existing?.CreatedAt ?? now,
      UpdatedAt: now,
    };
    try {
      await this.docClient.send(
        new PutCommand({ TableName: this.tableName, Item: this.mapper.toItem(entity) })
      );
      return entity;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
