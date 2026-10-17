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
import type { CodecType, Job, JobStatus } from '../types.js';

/** ジョブを一意に識別するキー */
export interface JobKey {
  jobId: string;
}

const JOB_STATUSES: readonly JobStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'];
const CODEC_TYPES: readonly CodecType[] = ['h264', 'vp9', 'av1'];

/**
 * 新属性名と旧属性名の対応。
 * 旧データは camelCase で保存されており、書き込まれないアイテムは旧形式のまま残る。
 */
const LEGACY_ATTRIBUTE_NAMES = {
  Status: ['status'],
  InputFile: ['inputFile'],
  OutputFile: ['outputFile'],
  OutputCodec: ['outputCodec'],
  FileName: ['fileName'],
  FileSize: ['fileSize'],
  CreatedAt: ['createdAt'],
  UpdatedAt: ['updatedAt'],
  ErrorMessage: ['errorMessage'],
  [TTL_ATTRIBUTE_NAME]: ['expiresAt'],
} as const;

/**
 * Job Mapper
 *
 * テーブルのキー属性は単一の `jobId` で、作り直さないと名前を変えられないため camelCase のまま使う。
 */
export class JobMapper implements EntityMapper<Job, JobKey> {
  public readonly entityType = 'Job';

  public readonly legacyAttributeNames = LEGACY_ATTRIBUTE_NAMES;

  public buildKeys(key: JobKey): DynamoDBKey {
    return { jobId: key.jobId };
  }

  public getKey(entity: Job): JobKey {
    return { jobId: entity.jobId };
  }

  public toItem(entity: Job): DynamoDBAttributes {
    const item: DynamoDBAttributes = {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      Status: entity.status,
      InputFile: entity.inputFile,
      OutputCodec: entity.outputCodec,
      FileName: entity.fileName,
      FileSize: entity.fileSize,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
      [TTL_ATTRIBUTE_NAME]: toTtlSeconds(entity.expiresAt),
    };
    if (entity.outputFile !== undefined) {
      item.OutputFile = entity.outputFile;
    }
    if (entity.errorMessage !== undefined) {
      item.ErrorMessage = entity.errorMessage;
    }
    return item;
  }

  /**
   * Entity の部分を保存用の属性に変換する。
   *
   * jobId・inputFile・outputCodec・fileName・fileSize・createdAt は作成後に変わらないため、
   * 含めると拒否する。
   *
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<Job>): DynamoDBAttributes {
    return {
      InputFile: immutablePatchValue(changes.inputFile, 'InputFile'),
      OutputCodec: immutablePatchValue(changes.outputCodec, 'OutputCodec'),
      FileName: immutablePatchValue(changes.fileName, 'FileName'),
      FileSize: immutablePatchValue(changes.fileSize, 'FileSize'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Status: requiredPatchValue(changes.status, 'Status'),
      OutputFile: optionalPatchValue(changes.outputFile),
      ErrorMessage: optionalPatchValue(changes.errorMessage),
      [TTL_ATTRIBUTE_NAME]: this.toTtlPatch(changes.expiresAt),
    };
  }

  /**
   * DynamoDB Item を Entity に変換する。旧形式 (camelCase・エポック秒・`expiresAt`) も読める。
   *
   * @throws InvalidEntityDataError 読めないデータのとき
   */
  public toEntity(item: DynamoDBAttributes): Job {
    const legacy = LEGACY_ATTRIBUTE_NAMES;
    const job: Job = {
      jobId: validateStringField(item.jobId, 'jobId'),
      status: validateEnumField(
        readAttribute(item, 'Status', legacy.Status),
        'Status',
        JOB_STATUSES
      ),
      inputFile: validateStringField(
        readAttribute(item, 'InputFile', legacy.InputFile),
        'InputFile'
      ),
      outputCodec: validateEnumField(
        readAttribute(item, 'OutputCodec', legacy.OutputCodec),
        'OutputCodec',
        CODEC_TYPES
      ),
      fileName: validateStringField(readAttribute(item, 'FileName', legacy.FileName), 'FileName'),
      fileSize: validateNumberField(readAttribute(item, 'FileSize', legacy.FileSize), 'FileSize', {
        min: 0,
      }),
      createdAt: readTimestamp(item, 'CreatedAt', legacy.CreatedAt),
      updatedAt: readTimestamp(item, 'UpdatedAt', legacy.UpdatedAt),
      expiresAt: readTimestamp(item, TTL_ATTRIBUTE_NAME, legacy[TTL_ATTRIBUTE_NAME]),
    };

    const outputFile = readAttribute(item, 'OutputFile', legacy.OutputFile);
    if (outputFile !== undefined) {
      job.outputFile = validateStringField(outputFile, 'OutputFile');
    }
    const errorMessage = readAttribute(item, 'ErrorMessage', legacy.ErrorMessage);
    if (errorMessage !== undefined) {
      job.errorMessage = validateStringField(errorMessage, 'ErrorMessage', { allowEmpty: true });
    }
    return job;
  }

  /** expiresAt は必須項目なので null は拒否し、数値は TTL のエポック秒へ換算する */
  private toTtlPatch(expiresAt: number | null | undefined): number | undefined {
    const value = requiredPatchValue(expiresAt, 'expiresAt');
    return value === undefined ? undefined : toTtlSeconds(value);
  }
}
