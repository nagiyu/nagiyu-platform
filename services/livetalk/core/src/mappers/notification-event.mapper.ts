import {
  validateNumberField,
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type {
  NotificationEventEntity,
  NotificationEventKey,
} from '../entities/notification-event.entity.js';
import { DEFAULT_CHARACTER_ID } from '../constants.js';
import { buildNotifSK, buildUserPK } from './keys.js';

export class NotificationEventMapper implements EntityMapper<
  NotificationEventEntity,
  NotificationEventKey
> {
  public readonly entityType = 'NotificationEvent';

  public toItem(entity: NotificationEventEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      notifId: entity.NotifID,
    });
    const item: DynamoDBItem = {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      NotifID: entity.NotifID,
      CharacterID: entity.CharacterID,
      Kind: entity.Kind,
      Title: entity.Title,
      Body: entity.Body,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.CreatedAt,
      Ttl: entity.Ttl,
    };
    if (entity.KnowledgeID !== undefined) item.KnowledgeID = entity.KnowledgeID;
    if (entity.SuggestedReply !== undefined) item.SuggestedReply = entity.SuggestedReply;
    if (entity.ConsumedAt !== undefined) item.ConsumedAt = entity.ConsumedAt;
    return item;
  }

  public toEntity(item: DynamoDBItem): NotificationEventEntity {
    // CharacterID が欠落している旧データは DEFAULT_CHARACTER_ID（hiyori）で補う（後方互換）
    const characterId =
      item.CharacterID !== undefined
        ? validateStringField(item.CharacterID, 'CharacterID')
        : DEFAULT_CHARACTER_ID;

    const entity: NotificationEventEntity = {
      UserID: validateStringField(item.UserID, 'UserID'),
      NotifID: validateStringField(item.NotifID, 'NotifID'),
      CharacterID: characterId,
      Kind: validateStringField(item.Kind, 'Kind') as 'normal' | 'critical',
      Title: validateStringField(item.Title, 'Title'),
      Body: validateStringField(item.Body, 'Body'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      Ttl: validateNumberField(item.Ttl, 'Ttl'),
    };
    if (item.KnowledgeID !== undefined) {
      entity.KnowledgeID = validateStringField(item.KnowledgeID, 'KnowledgeID');
    }
    if (item.SuggestedReply !== undefined) {
      entity.SuggestedReply = validateStringField(item.SuggestedReply, 'SuggestedReply');
    }
    if (item.ConsumedAt !== undefined) {
      entity.ConsumedAt = validateNumberField(item.ConsumedAt, 'ConsumedAt');
    }
    return entity;
  }

  public buildKeys(key: NotificationEventKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildNotifSK(key.notifId),
    };
  }
}
