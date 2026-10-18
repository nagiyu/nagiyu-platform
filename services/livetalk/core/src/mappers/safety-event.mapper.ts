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
import type {
  SafetyEventEntity,
  SafetyEventKey,
  SafetyEventSummary,
} from '../entities/safety-event.entity.js';
import type { SafetyTrigger } from '../safety/types.js';
import { buildSafetyEventGSI2PK, buildSafetyEventSK, buildUserPK } from './keys.js';

export class SafetyEventMapper implements EntityMapper<SafetyEventEntity, SafetyEventKey> {
  public readonly entityType = 'SafetyEvent';

  public buildKeys(key: SafetyEventKey): DynamoDBKey {
    return { PK: buildUserPK(key.userId), SK: buildSafetyEventSK(key.eventId) };
  }

  public getKey(entity: SafetyEventEntity): SafetyEventKey {
    return { userId: entity.userId, eventId: entity.eventId };
  }

  public toItem(entity: SafetyEventEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      EventID: entity.eventId,
      Trigger: entity.trigger,
      DetectedPattern: entity.detectedPattern,
      InputText: entity.inputText,
      ResponseText: entity.responseText,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
      // 全 SafetyEvent に付け、GSI2 の Query で横断取得できるようにする (sparse GSI)
      GSI2PK: buildSafetyEventGSI2PK(),
      GSI2SK: entity.eventId,
      ...(entity.characterId !== undefined && { CharacterID: entity.characterId }),
      ...(entity.moderationCategories !== undefined && {
        ModerationCategories: entity.moderationCategories,
      }),
    };
  }

  /** GSI2 の属性は key から付け直し、patch に識別子を混ぜさせない。 */
  public toUpdateAttributes(
    changes: EntityPatch<SafetyEventEntity>,
    key: SafetyEventKey
  ): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      EventID: immutablePatchValue(changes.eventId, 'EventID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Trigger: requiredPatchValue(changes.trigger, 'Trigger'),
      DetectedPattern: requiredPatchValue(changes.detectedPattern, 'DetectedPattern'),
      InputText: requiredPatchValue(changes.inputText, 'InputText'),
      ResponseText: requiredPatchValue(changes.responseText, 'ResponseText'),
      CharacterID: optionalPatchValue(changes.characterId),
      ModerationCategories: optionalPatchValue(changes.moderationCategories),
      GSI2PK: buildSafetyEventGSI2PK(),
      GSI2SK: key.eventId,
    };
  }

  public toEntity(item: DynamoDBAttributes): SafetyEventEntity {
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      eventId: validateStringField(item.EventID, 'EventID'),
      trigger: validateStringField(item.Trigger, 'Trigger') as SafetyTrigger,
      detectedPattern: validateStringField(item.DetectedPattern, 'DetectedPattern'),
      inputText: validateStringField(item.InputText, 'InputText', { allowEmpty: true }),
      responseText: validateStringField(item.ResponseText, 'ResponseText', { allowEmpty: true }),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
      ...(item.CharacterID !== undefined && {
        characterId: validateStringField(item.CharacterID, 'CharacterID'),
      }),
      ...(item.ModerationCategories !== undefined && {
        moderationCategories: validateStringField(
          item.ModerationCategories,
          'ModerationCategories',
          {
            allowEmpty: true,
          }
        ),
      }),
    };
  }

  /**
   * GSI2 の INCLUDE 射影から読むため、PII である inputText / responseText は含まない。
   */
  public toSummary(item: DynamoDBAttributes): SafetyEventSummary {
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      eventId: validateStringField(item.EventID, 'EventID'),
      trigger: validateStringField(item.Trigger, 'Trigger') as SafetyTrigger,
      detectedPattern: validateStringField(item.DetectedPattern, 'DetectedPattern'),
      createdAt: readTimestamp(item, 'CreatedAt'),
      ...(item.CharacterID !== undefined && {
        characterId: validateStringField(item.CharacterID, 'CharacterID'),
      }),
    };
  }
}
