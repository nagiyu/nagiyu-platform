import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { logger } from '@nagiyu/common';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import type { CreateNoteInput, NoteEntity, NoteKey } from '../entities/note.entity.js';
import { NoteMapper } from '../mappers/note.mapper.js';
import { buildNoteSK, buildNoteSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { NoteRepository } from './note.repository.interface.js';

export class DynamoDBNoteRepository implements NoteRepository {
  private readonly mapper: NoteMapper;
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
    this.mapper = new NoteMapper();
  }

  public async put(input: CreateNoteInput): Promise<NoteEntity> {
    const now = this.nowMs();
    const entity: NoteEntity = { ...input, CreatedAt: now, UpdatedAt: now };
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

  public async list(userId: string, characterId: string, limit = 100): Promise<NoteEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildNoteSKPrefix(characterId);
    const results: NoteEntity[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    for (;;) {
      let result;
      try {
        result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
            ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
            ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
            ScanIndexForward: false,
            Limit: limit,
            ExclusiveStartKey: exclusiveStartKey,
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DatabaseError(message, error instanceof Error ? error : undefined);
      }

      for (const raw of result.Items ?? []) {
        this.pushMappedEntity(results, raw as unknown as DynamoDBItem, userId, characterId);
      }

      if (!result.LastEvaluatedKey || results.length >= limit) break;
      exclusiveStartKey = result.LastEvaluatedKey;
    }

    return results;
  }

  public async listAll(userId: string, characterId: string): Promise<NoteEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildNoteSKPrefix(characterId);
    const results: NoteEntity[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    for (;;) {
      let result;
      try {
        result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
            ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
            ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
            ScanIndexForward: false,
            Limit: 100,
            ExclusiveStartKey: exclusiveStartKey,
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DatabaseError(message, error instanceof Error ? error : undefined);
      }

      for (const raw of result.Items ?? []) {
        this.pushMappedEntity(results, raw as unknown as DynamoDBItem, userId, characterId);
      }

      if (!result.LastEvaluatedKey) break;
      exclusiveStartKey = result.LastEvaluatedKey;
    }

    return results;
  }

  /**
   * item を NoteEntity にマップして results に追加する。
   * 旧設計（Knowledge 昇格方式の Note 等）や破損データで toEntity が失敗した場合は、
   * その item のみをスキップして警告ログを出し、リスト全体の取得は継続する（fail-warn）。
   */
  private pushMappedEntity(
    results: NoteEntity[],
    raw: DynamoDBItem,
    userId: string,
    characterId: string
  ): void {
    try {
      results.push(this.mapper.toEntity(raw));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const sk = (raw as { SK?: unknown }).SK;
      logger.warn(
        '[DynamoDBNoteRepository] ノート item のマップに失敗しました（旧設計/破損の可能性・スキップ）',
        { userId, characterId, sk, error: message }
      );
    }
  }

  public async get(key: NoteKey): Promise<NoteEntity | null> {
    const pk = buildUserPK(key.userId);
    const sk = buildNoteSK(key.characterId, key.noteId);
    try {
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

  public async listRecent(
    userId: string,
    characterId: string,
    options: { days: number; limit?: number }
  ): Promise<NoteEntity[]> {
    const { days, limit = 100 } = options;
    const threshold = this.nowMs() - days * 24 * 60 * 60 * 1000;
    const all = await this.list(userId, characterId, limit);
    return all.filter((note) => note.CreatedAt >= threshold);
  }

  public async updateReaction(key: NoteKey, reaction: string): Promise<void> {
    const pk = buildUserPK(key.userId);
    const sk = buildNoteSK(key.characterId, key.noteId);
    const now = this.nowMs();

    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          ConditionExpression: 'attribute_exists(PK)',
          UpdateExpression: 'SET Reaction = :reaction, UpdatedAt = :updatedAt',
          ExpressionAttributeValues: { ':reaction': reaction, ':updatedAt': now },
        })
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        logger.warn('[DynamoDBNoteRepository] updateReaction: 対象ノートが存在しません', { key });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
