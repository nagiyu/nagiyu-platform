import {
  TTL_ATTRIBUTE_NAME,
  immutablePatchValue,
  optionalPatchValue,
  readAttribute,
  readTimestamp,
  requiredPatchValue,
  toTtlSeconds,
  validateEnumField,
  validateNumberField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { ClipStatus, Highlight, HighlightKey, HighlightStatus } from '../types.js';
import type { EmotionLabel, HighlightSource } from '../libs/highlight-extractor.service.js';

/** 見どころアイテムの SK の接頭辞 */
export const HIGHLIGHT_SK_PREFIX = 'HIGHLIGHT#';

/**
 * ジョブ ID から、そのジョブの見どころアイテムが載るパーティションキーを構築する
 *
 * @param jobId - ジョブID
 * @returns PK
 */
export function buildHighlightPk(jobId: string): string {
  return `JOB#${jobId}`;
}

const SOURCES = ['motion', 'volume', 'emotion', 'both'] as const;
const STATUSES = ['accepted', 'rejected', 'unconfirmed'] as const;
const CLIP_STATUSES = ['PENDING', 'GENERATING', 'GENERATED', 'FAILED'] as const;
const EMOTIONS = ['laugh', 'excite', 'touch', 'tension'] as const;

/** 旧形式 (camelCase) の属性名。書き込みは新名のみで、旧データは読み取り側で受ける */
const LEGACY_ATTRIBUTE_NAMES = {
  HighlightID: ['highlightId'],
  JobID: ['jobId'],
  Order: ['order'],
  StartSec: ['startSec'],
  EndSec: ['endSec'],
  Source: ['source'],
  Status: ['status'],
  ClipStatus: ['clipStatus'],
  DominantEmotion: ['dominantEmotion'],
  [TTL_ATTRIBUTE_NAME]: ['expiresAt'],
} as const;

/**
 * Highlight Mapper
 *
 * Highlight と DynamoDB Item 間の変換を行う
 */
export class HighlightMapper implements EntityMapper<Highlight, HighlightKey> {
  public readonly entityType = 'HIGHLIGHT';

  public readonly legacyAttributeNames = LEGACY_ATTRIBUTE_NAMES;

  public buildKeys(key: HighlightKey): DynamoDBKey {
    return {
      PK: buildHighlightPk(key.jobId),
      SK: `${HIGHLIGHT_SK_PREFIX}${key.highlightId}`,
    };
  }

  public getKey(entity: Highlight): HighlightKey {
    return { jobId: entity.jobId, highlightId: entity.highlightId };
  }

  public toItem(entity: Highlight): DynamoDBAttributes {
    const item: DynamoDBAttributes = {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      HighlightID: entity.highlightId,
      JobID: entity.jobId,
      Order: entity.order,
      StartSec: entity.startSec,
      EndSec: entity.endSec,
      Source: entity.source,
      Status: entity.status,
      ClipStatus: entity.clipStatus,
      [TTL_ATTRIBUTE_NAME]: toTtlSeconds(entity.expiresAt),
    };

    if (entity.clipGeneratingStartedAt !== undefined) {
      item.ClipGeneratingStartedAt = entity.clipGeneratingStartedAt;
    }

    if (entity.dominantEmotion !== undefined) {
      item.DominantEmotion = entity.dominantEmotion;
    }

    return item;
  }

  /**
   * Entity の部分を保存用の属性に変換
   *
   * highlightId・jobId (キーの値を写した属性) は作成後に変えられないため、含めると拒否する。
   * expiresAt は Entity では必須のため、null による TTL の削除は拒否する。
   *
   * @param changes - 変更する項目 (undefined は変更なし、null は属性削除)
   * @returns 保存用の属性
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<Highlight>): DynamoDBAttributes {
    return {
      HighlightID: immutablePatchValue(changes.highlightId, 'HighlightID'),
      JobID: immutablePatchValue(changes.jobId, 'JobID'),
      Order: requiredPatchValue(changes.order, 'Order'),
      StartSec: requiredPatchValue(changes.startSec, 'StartSec'),
      EndSec: requiredPatchValue(changes.endSec, 'EndSec'),
      Source: requiredPatchValue(changes.source, 'Source'),
      Status: requiredPatchValue(changes.status, 'Status'),
      ClipStatus: requiredPatchValue(changes.clipStatus, 'ClipStatus'),
      ClipGeneratingStartedAt: optionalPatchValue(changes.clipGeneratingStartedAt),
      DominantEmotion: optionalPatchValue(changes.dominantEmotion),
      [TTL_ATTRIBUTE_NAME]:
        typeof changes.expiresAt === 'number'
          ? toTtlSeconds(changes.expiresAt)
          : requiredPatchValue(changes.expiresAt, TTL_ATTRIBUTE_NAME),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * 旧形式 (camelCase の属性名・`expiresAt` の TTL) も読む。
   *
   * @param item - DynamoDB Item
   * @returns Highlight
   * @throws InvalidEntityDataError 検証に失敗したとき
   */
  public toEntity(item: DynamoDBAttributes): Highlight {
    const entity: Highlight = {
      highlightId: validateStringField(
        readAttribute(item, 'HighlightID', ['highlightId']),
        'HighlightID'
      ),
      jobId: validateStringField(readAttribute(item, 'JobID', ['jobId']), 'JobID'),
      order: validateNumberField(readAttribute(item, 'Order', ['order']), 'Order'),
      startSec: validateNumberField(readAttribute(item, 'StartSec', ['startSec']), 'StartSec'),
      endSec: validateNumberField(readAttribute(item, 'EndSec', ['endSec']), 'EndSec'),
      source: validateEnumField<HighlightSource>(
        readAttribute(item, 'Source', ['source']),
        'Source',
        SOURCES
      ),
      status: validateEnumField<HighlightStatus>(
        readAttribute(item, 'Status', ['status']),
        'Status',
        STATUSES
      ),
      clipStatus: validateEnumField<ClipStatus>(
        readAttribute(item, 'ClipStatus', ['clipStatus']),
        'ClipStatus',
        CLIP_STATUSES
      ),
      expiresAt: readTimestamp(item, TTL_ATTRIBUTE_NAME, ['expiresAt']),
    };

    const clipGeneratingStartedAt = readAttribute(item, 'ClipGeneratingStartedAt');
    if (clipGeneratingStartedAt !== undefined) {
      entity.clipGeneratingStartedAt = validateNumberField(
        clipGeneratingStartedAt,
        'ClipGeneratingStartedAt'
      );
    }

    const dominantEmotion = readAttribute(item, 'DominantEmotion', ['dominantEmotion']);
    if (dominantEmotion !== undefined) {
      entity.dominantEmotion = validateEnumField<EmotionLabel>(
        dominantEmotion,
        'DominantEmotion',
        EMOTIONS
      );
    }

    return entity;
  }
}
