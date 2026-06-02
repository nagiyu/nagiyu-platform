import {
  validateNumberField,
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type { NoteEntity, NoteKey } from '../entities/note.entity.js';
import { buildNoteSK, buildUserPK } from './keys.js';

export class NoteMapper implements EntityMapper<NoteEntity, NoteKey> {
  public readonly entityType = 'Note';

  public toItem(entity: NoteEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      characterId: entity.CharacterID,
      noteId: entity.NoteID,
    });
    const item: DynamoDBItem = {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      CharacterID: entity.CharacterID,
      NoteID: entity.NoteID,
      Title: entity.Title,
      Body: entity.Body,
      RelatedKnowledgeIds: entity.RelatedKnowledgeIds,
      RelatedCategory: entity.RelatedCategory,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
    if (entity.ReadAt !== undefined) {
      item.ReadAt = entity.ReadAt;
    }
    return item;
  }

  public toEntity(item: DynamoDBItem): NoteEntity {
    const entity: NoteEntity = {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      NoteID: validateStringField(item.NoteID, 'NoteID'),
      Title: validateStringField(item.Title, 'Title'),
      Body: validateStringField(item.Body, 'Body'),
      RelatedKnowledgeIds: Array.isArray(item.RelatedKnowledgeIds)
        ? (item.RelatedKnowledgeIds as string[])
        : [],
      RelatedCategory: validateStringField(item.RelatedCategory, 'RelatedCategory'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
    if (item.ReadAt !== undefined) {
      entity.ReadAt = validateNumberField(item.ReadAt, 'ReadAt');
    }
    return entity;
  }

  public buildKeys(key: NoteKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildNoteSK(key.characterId, key.noteId),
    };
  }
}
