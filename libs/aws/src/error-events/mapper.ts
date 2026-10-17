/**
 * ErrorEvent ↔ DynamoDB Item の変換
 *
 * 書き込み (Item の組み立て) と読み出し (Item の検証) の保存形式を 1 か所に集約する。
 * 書き手と読み手が別々に形を持つと、フィールド追加時に片方だけ更新される事故が起きる。
 */

import {
  ERROR_SEVERITIES,
  ERROR_SOURCES,
  type ErrorEvent,
  type ErrorSeverity,
  type ErrorSource,
} from '@nagiyu/common';
import { InvalidEntityDataError } from '../dynamodb/errors.js';
import type {
  DynamoDBAttributes,
  DynamoDBKey,
  EntityMapper,
  EntityPatch,
} from '../dynamodb/mapper/entity-mapper.interface.js';
import { immutablePatchValue } from '../dynamodb/mapper/patch-values.js';
import {
  TTL_ATTRIBUTE_NAME,
  readAttribute,
  readTimestamp,
  toTtlSeconds,
  validateEnumField,
  validateStringField,
} from '../dynamodb/validators.js';
import type { ErrorEventKey } from './writer.js';

const ERROR_MESSAGES = {
  INVALID_OCCURRED_AT: 'occurredAt が日時として解釈できません',
} as const;

/**
 * DynamoDB Item の Type 値
 */
export const ERROR_EVENT_ENTITY_TYPE = 'ErrorEvent';

/**
 * 全件横断クエリ用 GSI1 のパーティションキー値（固定）
 */
export const ERROR_EVENT_GSI1_PK = 'ERROR_EVENT_ALL';

/**
 * TTL の保持期間（日数）
 */
export const ERROR_EVENT_TTL_DAYS = 180;

/**
 * PK プレフィックス
 */
export const ERROR_EVENT_PK_PREFIX = 'ERROR_EVENT#';

/**
 * SK プレフィックス
 */
export const ERROR_EVENT_SK_PREFIX = 'OCCURRED#';

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 新属性名 → 旧属性名。旧形式は小文字始まりで、occurredAt は ISO 文字列で保存されている。
 */
const LEGACY_ATTRIBUTE_NAMES = {
  EventID: ['eventId'],
  ServiceID: ['serviceId'],
  Source: ['source'],
  Severity: ['severity'],
  Title: ['title'],
  Message: ['message'],
  Context: ['context'],
  OccurredAt: ['occurredAt'],
  [TTL_ATTRIBUTE_NAME]: ['ttl'],
} as const;

/**
 * PK を構築する。
 */
export function buildErrorEventPK(serviceId: string): string {
  return `${ERROR_EVENT_PK_PREFIX}${serviceId}`;
}

/**
 * SK を構築する。
 *
 * SK は時系列順に並ぶことに意味があるため、時刻は固定長の ISO 文字列で埋め込む。
 *
 * @param occurredAt - 発生時刻 (epoch ミリ秒)
 * @throws InvalidEntityDataError occurredAt が日時として解釈できないとき
 */
export function buildErrorEventSK(occurredAt: number, eventId: string): string {
  return `${ERROR_EVENT_SK_PREFIX}${toIsoString(occurredAt)}#${eventId}`;
}

function toIsoString(occurredAt: number): string {
  const date = new Date(occurredAt);
  if (typeof occurredAt !== 'number' || Number.isNaN(date.getTime())) {
    throw new InvalidEntityDataError(`${ERROR_MESSAGES.INVALID_OCCURRED_AT}: ${occurredAt}`);
  }
  return date.toISOString();
}

/**
 * ErrorEvent Mapper
 *
 * エラーイベントは書き込み後に変更しないため、update は常に拒否する。
 */
export class ErrorEventMapper implements EntityMapper<ErrorEvent, ErrorEventKey> {
  public readonly entityType = ERROR_EVENT_ENTITY_TYPE;

  public readonly legacyAttributeNames = LEGACY_ATTRIBUTE_NAMES;

  private readonly now: () => number;

  /**
   * @param now - CreatedAt に使う現在時刻 (epoch ミリ秒) の供給元。テストで差し替える
   */
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  public buildKeys(key: ErrorEventKey): DynamoDBKey {
    return {
      PK: buildErrorEventPK(key.serviceId),
      SK: buildErrorEventSK(key.occurredAt, key.eventId),
    };
  }

  public getKey(entity: ErrorEvent): ErrorEventKey {
    return {
      serviceId: entity.serviceId,
      occurredAt: entity.occurredAt,
      eventId: entity.eventId,
    };
  }

  /**
   * ErrorEvent を DynamoDB に書き込む Item へ変換する。
   *
   * `UpdatedAt` は store が書き込み時に上書きする。
   */
  public toItem(entity: ErrorEvent): DynamoDBAttributes {
    const keys = this.buildKeys(this.getKey(entity));
    const now = this.now();

    return {
      ...keys,
      Type: this.entityType,
      GSI1PK: ERROR_EVENT_GSI1_PK,
      GSI1SK: keys.SK,
      EventID: entity.eventId,
      ServiceID: entity.serviceId,
      Source: entity.source,
      Severity: entity.severity,
      Title: entity.title,
      Message: entity.message,
      Context: entity.context,
      OccurredAt: entity.occurredAt,
      [TTL_ATTRIBUTE_NAME]: toTtlSeconds(entity.occurredAt + ERROR_EVENT_TTL_DAYS * MILLIS_PER_DAY),
      CreatedAt: now,
      UpdatedAt: now,
    };
  }

  /**
   * エラーイベントは作成後に変更できないため、いずれかの項目を含む patch を拒否する。
   *
   * @throws InvalidEntityDataError 何らかの項目が指定されたとき
   */
  public toUpdateAttributes(changes: EntityPatch<ErrorEvent>): DynamoDBAttributes {
    return {
      EventID: immutablePatchValue(changes.eventId, 'EventID'),
      ServiceID: immutablePatchValue(changes.serviceId, 'ServiceID'),
      Source: immutablePatchValue(changes.source, 'Source'),
      Severity: immutablePatchValue(changes.severity, 'Severity'),
      Title: immutablePatchValue(changes.title, 'Title'),
      Message: immutablePatchValue(changes.message, 'Message'),
      Context: immutablePatchValue(changes.context, 'Context'),
      OccurredAt: immutablePatchValue(changes.occurredAt, 'OccurredAt'),
    };
  }

  /**
   * DynamoDB から読み出した Item (unmarshall 済み) を検証して ErrorEvent に変換する。
   *
   * 新名を優先し、旧名 (小文字始まり・occurredAt は ISO 文字列) も読む。
   * 不正な Item を黙って除外すると障害に気づけないため、呼び出し側へ例外として伝える。
   *
   * @throws InvalidEntityDataError フィールドが欠けている・型が違う・Source / Severity が一覧外のとき
   */
  public toEntity(item: DynamoDBAttributes): ErrorEvent {
    const read = (name: keyof typeof LEGACY_ATTRIBUTE_NAMES) =>
      readAttribute(item, name, LEGACY_ATTRIBUTE_NAMES[name]);

    return {
      eventId: validateStringField(read('EventID'), 'EventID', { allowEmpty: true }),
      serviceId: validateStringField(read('ServiceID'), 'ServiceID', { allowEmpty: true }),
      source: validateEnumField<ErrorSource>(read('Source'), 'Source', ERROR_SOURCES),
      severity: validateEnumField<ErrorSeverity>(read('Severity'), 'Severity', ERROR_SEVERITIES),
      title: validateStringField(read('Title'), 'Title', { allowEmpty: true }),
      message: validateStringField(read('Message'), 'Message', { allowEmpty: true }),
      context: validateStringField(read('Context'), 'Context', { allowEmpty: true }),
      occurredAt: readTimestamp(item, 'OccurredAt', LEGACY_ATTRIBUTE_NAMES.OccurredAt),
    };
  }
}
