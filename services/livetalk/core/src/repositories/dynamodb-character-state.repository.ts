import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import { updateAffectionLevel } from '../affection/calculator.js';
import type {
  CharacterStateEntity,
  CharacterStateKey,
  CreateCharacterStateInput,
  UpdateCharacterStateInput,
} from '../entities/character-state.entity.js';
import { CharacterStateMapper } from '../mappers/character-state.mapper.js';
import type { CharacterStateRepository } from './character-state.repository.interface.js';

export class DynamoDBCharacterStateRepository implements CharacterStateRepository {
  private readonly mapper: CharacterStateMapper;
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
    this.mapper = new CharacterStateMapper();
  }

  public async getById(key: CharacterStateKey): Promise<CharacterStateEntity | null> {
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

  public async upsert(
    input: CreateCharacterStateInput,
    updates: UpdateCharacterStateInput = {}
  ): Promise<CharacterStateEntity> {
    const now = this.nowMs();
    const existing = await this.getById({
      userId: input.UserID,
      characterId: input.CharacterID,
    });

    const merged: CharacterStateEntity = {
      UserID: input.UserID,
      CharacterID: input.CharacterID,
      LastInteractionAt: updates.LastInteractionAt ?? input.LastInteractionAt,
      AffectionLevel:
        updates.AffectionLevel ?? input.AffectionLevel ?? existing?.AffectionLevel ?? 0,
      CreatedAt: existing?.CreatedAt ?? now,
      UpdatedAt: now,
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

  public async updateAffection(
    userId: string,
    characterId: string,
    delta: number
  ): Promise<CharacterStateEntity> {
    const now = this.nowMs();
    const existing = await this.getById({ userId, characterId });
    const currentLevel = existing?.AffectionLevel ?? 0;
    const newLevel = updateAffectionLevel(currentLevel, delta);

    return this.upsert(
      {
        UserID: userId,
        CharacterID: characterId,
        LastInteractionAt: existing?.LastInteractionAt ?? now,
        AffectionLevel: newLevel,
      },
      { LastInteractionAt: now, AffectionLevel: newLevel }
    );
  }
}
