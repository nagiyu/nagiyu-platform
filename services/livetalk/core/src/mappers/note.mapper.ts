import {
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
      TopicID: entity.TopicID,
      Subject: entity.Subject,
      Headline: entity.Headline,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
    if (entity.Reaction !== undefined) {
      item.Reaction = entity.Reaction;
    }
    return item;
  }

  public toEntity(item: DynamoDBItem): NoteEntity {
    const entity: NoteEntity = {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      NoteID: validateStringField(item.NoteID, 'NoteID'),
      TopicID: validateStringField(item.TopicID, 'TopicID'),
      Subject: validateStringField(item.Subject, 'Subject'),
      Headline: validateStringField(item.Headline, 'Headline'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
    if (item.Reaction !== undefined) {
      entity.Reaction = validateStringField(item.Reaction, 'Reaction');
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
