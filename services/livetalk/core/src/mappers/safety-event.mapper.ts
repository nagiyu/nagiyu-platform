import {
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type { SafetyEventEntity, SafetyEventKey } from '../entities/safety-event.entity.js';
import type { SafetyTrigger } from '../safety/types.js';
import { buildSafetyEventSK, buildUserPK } from './keys.js';

export class SafetyEventMapper implements EntityMapper<SafetyEventEntity, SafetyEventKey> {
  public readonly entityType = 'SafetyEvent';

  public toItem(entity: SafetyEventEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      eventId: entity.EventID,
    });

    const item: DynamoDBItem = {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      EventID: entity.EventID,
      Trigger: entity.Trigger,
      DetectedPattern: entity.DetectedPattern,
      InputText: entity.InputText,
      ResponseText: entity.ResponseText,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };

    if (entity.ModerationCategories !== undefined) {
      item.ModerationCategories = entity.ModerationCategories;
    }

    return item;
  }

  public toEntity(item: DynamoDBItem): SafetyEventEntity {
    const entity: SafetyEventEntity = {
      UserID: validateStringField(item.UserID, 'UserID'),
      EventID: validateStringField(item.EventID, 'EventID'),
      Trigger: validateStringField(item.Trigger, 'Trigger') as SafetyTrigger,
      DetectedPattern: validateStringField(item.DetectedPattern, 'DetectedPattern'),
      InputText: validateStringField(item.InputText, 'InputText', { allowEmpty: true }),
      ResponseText: validateStringField(item.ResponseText, 'ResponseText', { allowEmpty: true }),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };

    if (item.ModerationCategories !== undefined) {
      entity.ModerationCategories = validateStringField(
        item.ModerationCategories,
        'ModerationCategories',
        { allowEmpty: true }
      );
    }

    return entity;
  }

  public buildKeys(key: SafetyEventKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildSafetyEventSK(key.eventId),
    };
  }
}
