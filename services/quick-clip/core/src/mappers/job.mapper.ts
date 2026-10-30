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
  validateObjectField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { AnalysisProgress, BatchStage, Job, JobKey } from '../types.js';

const BATCH_STAGES = ['downloading', 'analyzing', 'clipping', 'aggregating'] as const;

/** 旧形式 (camelCase) の属性名。書き込みは新名のみで、旧データは読み取り側で受ける */
const LEGACY_ATTRIBUTE_NAMES = {
  JobID: ['jobId'],
  BatchJobID: ['batchJobId'],
  BatchStage: ['batchStage'],
  OriginalFileName: ['originalFileName'],
  FileSize: ['fileSize'],
  DurationSec: ['durationSec'],
  CreatedAt: ['createdAt'],
  ErrorMessage: ['errorMessage'],
  AnalysisProgress: ['analysisProgress'],
  [TTL_ATTRIBUTE_NAME]: ['expiresAt'],
} as const;

/**
 * Job Mapper
 *
 * Job と DynamoDB Item 間の変換を行う
 */
export class JobMapper implements EntityMapper<Job, JobKey> {
  public readonly entityType = 'JOB';

  public readonly legacyAttributeNames = LEGACY_ATTRIBUTE_NAMES;

  public buildKeys(key: JobKey): DynamoDBKey {
    return {
      PK: `JOB#${key.jobId}`,
      SK: `JOB#${key.jobId}`,
    };
  }

  public getKey(entity: Job): JobKey {
    return { jobId: entity.jobId };
  }

  public toItem(entity: Job): DynamoDBAttributes {
    const item: DynamoDBAttributes = {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      JobID: entity.jobId,
      OriginalFileName: entity.originalFileName,
      FileSize: entity.fileSize,
      CreatedAt: entity.createdAt,
      [TTL_ATTRIBUTE_NAME]: toTtlSeconds(entity.expiresAt),
    };

    if (entity.batchJobId) {
      item.BatchJobID = entity.batchJobId;
    }
    if (entity.batchStage) {
      item.BatchStage = entity.batchStage;
    }
    if (entity.durationSec !== undefined) {
      item.DurationSec = entity.durationSec;
    }
    if (entity.errorMessage) {
      item.ErrorMessage = entity.errorMessage;
    }
    if (entity.analysisProgress) {
      item.AnalysisProgress = entity.analysisProgress;
    }

    return item;
  }

  /**
   * Entity の部分を保存用の属性に変換
   *
   * jobId (キーの値を写した属性) と createdAt は作成後に変えられないため、含めると拒否する。
   * expiresAt は Entity では必須のため、null による TTL の削除は拒否する。
   *
   * @param changes - 変更する項目 (undefined は変更なし、null は属性削除)
   * @returns 保存用の属性
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<Job>): DynamoDBAttributes {
    return {
      JobID: immutablePatchValue(changes.jobId, 'JobID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      OriginalFileName: requiredPatchValue(changes.originalFileName, 'OriginalFileName'),
      FileSize: requiredPatchValue(changes.fileSize, 'FileSize'),
      [TTL_ATTRIBUTE_NAME]:
        typeof changes.expiresAt === 'number'
          ? toTtlSeconds(changes.expiresAt)
          : requiredPatchValue(changes.expiresAt, TTL_ATTRIBUTE_NAME),
      BatchJobID: optionalPatchValue(changes.batchJobId),
      BatchStage: optionalPatchValue(changes.batchStage),
      DurationSec: optionalPatchValue(changes.durationSec),
      ErrorMessage: optionalPatchValue(changes.errorMessage),
      AnalysisProgress: optionalPatchValue(changes.analysisProgress),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * 旧形式 (camelCase の属性名・エポック秒の時刻・`expiresAt` の TTL) も読む。
   *
   * @param item - DynamoDB Item
   * @returns Job
   * @throws InvalidEntityDataError 検証に失敗したとき
   */
  public toEntity(item: DynamoDBAttributes): Job {
    const entity: Job = {
      jobId: validateStringField(readAttribute(item, 'JobID', ['jobId']), 'JobID'),
      originalFileName: validateStringField(
        readAttribute(item, 'OriginalFileName', ['originalFileName']),
        'OriginalFileName'
      ),
      fileSize: validateNumberField(readAttribute(item, 'FileSize', ['fileSize']), 'FileSize'),
      createdAt: readTimestamp(item, 'CreatedAt', ['createdAt']),
      expiresAt: readTimestamp(item, TTL_ATTRIBUTE_NAME, ['expiresAt']),
    };

    const batchJobId = readAttribute(item, 'BatchJobID', ['batchJobId']);
    if (batchJobId !== undefined) {
      entity.batchJobId = validateStringField(batchJobId, 'BatchJobID');
    }
    const batchStage = readAttribute(item, 'BatchStage', ['batchStage']);
    if (batchStage !== undefined) {
      entity.batchStage = validateEnumField<BatchStage>(batchStage, 'BatchStage', BATCH_STAGES);
    }
    const durationSec = readAttribute(item, 'DurationSec', ['durationSec']);
    if (durationSec !== undefined) {
      entity.durationSec = validateNumberField(durationSec, 'DurationSec');
    }
    const errorMessage = readAttribute(item, 'ErrorMessage', ['errorMessage']);
    if (errorMessage !== undefined) {
      entity.errorMessage = validateStringField(errorMessage, 'ErrorMessage', {
        allowEmpty: true,
      });
    }
    const analysisProgress = readAttribute(item, 'AnalysisProgress', ['analysisProgress']);
    if (analysisProgress !== undefined) {
      entity.analysisProgress = validateObjectField<AnalysisProgress>(
        analysisProgress,
        'AnalysisProgress'
      );
    }

    return entity;
  }
}
