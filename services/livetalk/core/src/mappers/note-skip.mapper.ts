import {
  immutablePatchValue,
  readTimestamp,
  requiredPatchValue,
  validateStringField,
  validateTimestampField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { NoteSkipEntity, NoteSkipKey } from '../entities/note-skip.entity.js';
import { buildNoteSkipSK, buildUserPK } from './keys.js';

/**
 * `NoteSkipEntity ↔ DynamoDB Item` の変換と PK/SK 組み立てを担当する Mapper。
 */
export class NoteSkipMapper implements EntityMapper<NoteSkipEntity, NoteSkipKey> {
  public readonly entityType = 'NoteSkip';

  public buildKeys(key: NoteSkipKey): DynamoDBKey {
    return {
      PK: buildUserPK(key.userId),
      SK: buildNoteSkipSK(key.characterId, key.topicId),
    };
  }

  public getKey(entity: NoteSkipEntity): NoteSkipKey {
    return {
      userId: entity.userId,
      characterId: entity.characterId,
      topicId: entity.topicId,
    };
  }

  public toItem(entity: NoteSkipEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      CharacterID: entity.characterId,
      TopicID: entity.topicId,
      DecidedAt: entity.decidedAt,
      UpdatedAt: entity.updatedAt,
      // 他の Entity と属性構成を揃える。記録は上書きするだけで作成日時を区別しないため更新日時と同じ値にする
      CreatedAt: entity.updatedAt,
    };
  }

  public toUpdateAttributes(changes: EntityPatch<NoteSkipEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CharacterID: immutablePatchValue(changes.characterId, 'CharacterID'),
      TopicID: immutablePatchValue(changes.topicId, 'TopicID'),
      DecidedAt: requiredPatchValue(changes.decidedAt, 'DecidedAt'),
    };
  }

  public toEntity(item: DynamoDBAttributes): NoteSkipEntity {
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      characterId: validateStringField(item.CharacterID, 'CharacterID'),
      topicId: validateStringField(item.TopicID, 'TopicID'),
      decidedAt: validateTimestampField(item.DecidedAt, 'DecidedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
    };
  }
}
