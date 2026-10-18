import {
  immutablePatchValue,
  optionalPatchValue,
  readTimestamp,
  requiredPatchValue,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { NoteEntity, NoteKey } from '../entities/note.entity.js';
import { buildNoteSK, buildUserPK } from './keys.js';

export class NoteMapper implements EntityMapper<NoteEntity, NoteKey> {
  public readonly entityType = 'Note';

  public buildKeys(key: NoteKey): DynamoDBKey {
    return {
      PK: buildUserPK(key.userId),
      SK: buildNoteSK(key.characterId, key.noteId),
    };
  }

  public getKey(entity: NoteEntity): NoteKey {
    return { userId: entity.userId, characterId: entity.characterId, noteId: entity.noteId };
  }

  public toItem(entity: NoteEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      CharacterID: entity.characterId,
      NoteID: entity.noteId,
      TopicID: entity.topicId,
      Subject: entity.subject,
      Headline: entity.headline,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
      ...(entity.reaction !== undefined && { Reaction: entity.reaction }),
    };
  }

  public toUpdateAttributes(changes: EntityPatch<NoteEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CharacterID: immutablePatchValue(changes.characterId, 'CharacterID'),
      NoteID: immutablePatchValue(changes.noteId, 'NoteID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      TopicID: requiredPatchValue(changes.topicId, 'TopicID'),
      Subject: requiredPatchValue(changes.subject, 'Subject'),
      Headline: requiredPatchValue(changes.headline, 'Headline'),
      Reaction: optionalPatchValue(changes.reaction),
    };
  }

  public toEntity(item: DynamoDBAttributes): NoteEntity {
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      characterId: validateStringField(item.CharacterID, 'CharacterID'),
      noteId: validateStringField(item.NoteID, 'NoteID'),
      topicId: validateStringField(item.TopicID, 'TopicID'),
      subject: validateStringField(item.Subject, 'Subject'),
      headline: validateStringField(item.Headline, 'Headline'),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
      ...(item.Reaction !== undefined && {
        reaction: validateStringField(item.Reaction, 'Reaction'),
      }),
    };
  }
}
