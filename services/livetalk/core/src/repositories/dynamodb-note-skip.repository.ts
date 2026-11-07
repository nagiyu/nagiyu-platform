import { type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, queryAllItems, toDatabaseError, type EntityStore } from '@nagiyu/aws';
import type {
  NoteSkipEntity,
  NoteSkipKey,
  PutNoteSkipInput,
} from '../entities/note-skip.entity.js';
import { NoteSkipMapper } from '../mappers/note-skip.mapper.js';
import { buildNoteSkipSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { NoteSkipRepository } from './note-skip.repository.interface.js';

export class DynamoDBNoteSkipRepository implements NoteSkipRepository {
  private readonly mapper = new NoteSkipMapper();
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly entityStore: EntityStore<NoteSkipEntity, NoteSkipKey>;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper, { now: nowMs });
  }

  public async put(input: PutNoteSkipInput): Promise<NoteSkipEntity> {
    return this.entityStore.put(input);
  }

  public async listAll(userId: string, characterId: string): Promise<NoteSkipEntity[]> {
    try {
      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: {
          ':pk': buildUserPK(userId),
          ':prefix': buildNoteSkipSKPrefix(characterId),
        },
      });
      return items.map((raw) => this.mapper.toEntity(raw));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  public async delete(key: NoteSkipKey): Promise<void> {
    await this.entityStore.deleteIfExists(key);
  }
}
