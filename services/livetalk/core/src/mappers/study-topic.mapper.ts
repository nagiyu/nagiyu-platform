import {
  validateNumberField,
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type { StudyTopicEntity, StudyTopicKey } from '../entities/study-topic.entity.js';
import { buildStudyTopicSK, buildUserPK } from './keys.js';

export class StudyTopicMapper implements EntityMapper<StudyTopicEntity, StudyTopicKey> {
  public readonly entityType = 'StudyTopic';

  public toItem(entity: StudyTopicEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      characterId: entity.CharacterID,
      topicId: entity.TopicID,
    });
    const item: DynamoDBItem = {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      CharacterID: entity.CharacterID,
      TopicID: entity.TopicID,
      Topic: entity.Topic,
      Priority: entity.Priority,
      Status: entity.Status,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
    if (entity.Ttl !== undefined) {
      item.Ttl = entity.Ttl;
    }
    return item;
  }

  public toEntity(item: DynamoDBItem): StudyTopicEntity {
    const status = validateStringField(item.Status, 'Status');
    const entity: StudyTopicEntity = {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      TopicID: validateStringField(item.TopicID, 'TopicID'),
      Topic: validateStringField(item.Topic, 'Topic'),
      Priority: validateNumberField(item.Priority, 'Priority'),
      Status: status as StudyTopicEntity['Status'],
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
    if (item.Ttl !== undefined) {
      entity.Ttl = validateNumberField(item.Ttl, 'Ttl');
    }
    return entity;
  }

  public buildKeys(key: StudyTopicKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildStudyTopicSK(key.characterId, key.topicId),
    };
  }
}
