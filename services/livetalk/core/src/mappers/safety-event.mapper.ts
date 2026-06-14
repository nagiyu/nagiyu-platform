import {
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
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
      // GSI2: SafetyEvent のみを sparse 索引化する横断レビュー用 GSI（ADR-2.22 / #3580）
      // 全 SafetyEvent に必ず付与することで、GSI2 クエリで横断取得できるようにする
      GSI2PK: buildSafetyEventGSI2PK(),
      GSI2SK: entity.EventID,
    };

    if (entity.CharacterID !== undefined) {
      item.CharacterID = entity.CharacterID;
    }

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

    if (item.CharacterID !== undefined) {
      entity.CharacterID = validateStringField(item.CharacterID, 'CharacterID');
    }

    if (item.ModerationCategories !== undefined) {
      entity.ModerationCategories = validateStringField(
        item.ModerationCategories,
        'ModerationCategories',
        { allowEmpty: true }
      );
    }

    return entity;
  }

  /**
   * DynamoDB アイテムを横断一覧用サマリ型に変換する（ADR-2.22 / #3580）。
   * GSI2 の INCLUDE 射影から読み取るため、InputText / ResponseText は含まない。
   */
  public toSummary(item: DynamoDBItem): SafetyEventSummary {
    const summary: SafetyEventSummary = {
      UserID: validateStringField(item.UserID, 'UserID'),
      EventID: validateStringField(item.EventID, 'EventID'),
      Trigger: validateStringField(item.Trigger, 'Trigger') as SafetyTrigger,
      DetectedPattern: validateStringField(item.DetectedPattern, 'DetectedPattern'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
    };

    if (item.CharacterID !== undefined) {
      summary.CharacterID = validateStringField(item.CharacterID, 'CharacterID');
    }

    return summary;
  }

  public buildKeys(key: SafetyEventKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildSafetyEventSK(key.eventId),
    };
  }
}
