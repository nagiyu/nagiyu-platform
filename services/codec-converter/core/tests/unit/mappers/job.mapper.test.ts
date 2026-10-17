import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { JobMapper } from '../../../src/mappers/job.mapper';
import type { Job } from '../../../src/types';

const CREATED_AT = 1704067200000;
const UPDATED_AT = 1704067800000;
const EXPIRES_AT = 1704153600000;
const KEY = { jobId: 'job-123' };

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    jobId: 'job-123',
    status: 'PENDING',
    inputFile: 'uploads/job-123/input.mp4',
    outputCodec: 'h264',
    fileName: 'sample.mp4',
    fileSize: 1024,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

/** 旧形式 (camelCase 属性・エポック秒・expiresAt) のアイテム */
function buildLegacyItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    jobId: 'job-123',
    status: 'COMPLETED',
    inputFile: 'uploads/job-123/input.mp4',
    outputFile: 'outputs/job-123/output.mp4',
    outputCodec: 'h264',
    fileName: 'sample.mp4',
    fileSize: 1024,
    createdAt: 1704067200,
    updatedAt: 1704067800,
    expiresAt: 1704153600,
    ...overrides,
  };
}

describe('JobMapper', () => {
  const mapper = new JobMapper();

  describe('buildKeys / getKey', () => {
    it('キー属性は camelCase の jobId だけで構築する', () => {
      expect(mapper.buildKeys(KEY)).toEqual({ jobId: 'job-123' });
    });

    it('Entity からビジネスキーを取り出す', () => {
      expect(mapper.getKey(buildJob())).toEqual(KEY);
    });
  });

  describe('toItem / toEntity', () => {
    it('PascalCase の属性で保存し、TTL はエポック秒にする', () => {
      expect(mapper.toItem(buildJob())).toEqual({
        jobId: 'job-123',
        Type: 'Job',
        Status: 'PENDING',
        InputFile: 'uploads/job-123/input.mp4',
        OutputCodec: 'h264',
        FileName: 'sample.mp4',
        FileSize: 1024,
        CreatedAt: CREATED_AT,
        UpdatedAt: UPDATED_AT,
        TTL: 1704153600,
      });
    });

    it('任意項目 (outputFile / errorMessage) があれば保存する', () => {
      const item = mapper.toItem(
        buildJob({ status: 'FAILED', outputFile: 'outputs/a', errorMessage: '失敗' })
      );

      expect(item).toMatchObject({ OutputFile: 'outputs/a', ErrorMessage: '失敗' });
    });

    it('新形式の Item から Entity に往復できる', () => {
      const job = buildJob({ status: 'FAILED', outputFile: 'outputs/a', errorMessage: '失敗' });

      expect(mapper.toEntity(mapper.toItem(job))).toEqual(job);
    });

    it('任意項目がなければ Entity にも含めない', () => {
      const entity = mapper.toEntity(mapper.toItem(buildJob()));

      expect(entity).not.toHaveProperty('outputFile');
      expect(entity).not.toHaveProperty('errorMessage');
    });

    it('空文字のエラーメッセージも読める', () => {
      const item = { ...mapper.toItem(buildJob()), ErrorMessage: '' };

      expect(mapper.toEntity(item).errorMessage).toBe('');
    });
  });

  describe('旧形式の読み取り', () => {
    it('camelCase の属性・エポック秒・expiresAt を読み、時刻をミリ秒にする', () => {
      expect(mapper.toEntity(buildLegacyItem())).toEqual(
        buildJob({
          status: 'COMPLETED',
          outputFile: 'outputs/job-123/output.mp4',
        })
      );
    });

    it('旧形式の errorMessage を読む', () => {
      const entity = mapper.toEntity(
        buildLegacyItem({ status: 'FAILED', outputFile: undefined, errorMessage: '失敗' })
      );

      expect(entity.errorMessage).toBe('失敗');
    });

    it('新名と旧名が両方あれば新名を優先する', () => {
      const entity = mapper.toEntity(buildLegacyItem({ Status: 'FAILED', TTL: 1704240000 }));

      expect(entity.status).toBe('FAILED');
      expect(entity.expiresAt).toBe(1704240000000);
    });
  });

  describe('読み出し時の検証', () => {
    it.each([
      ['jobId', { jobId: undefined }],
      ['Status', { status: 'UNKNOWN' }],
      ['InputFile', { inputFile: 1 }],
      ['OutputCodec', { outputCodec: 'mp3' }],
      ['FileName', { fileName: undefined }],
      ['FileSize', { fileSize: '1024' }],
      ['FileSize', { fileSize: -1 }],
      ['CreatedAt', { createdAt: undefined }],
      ['UpdatedAt', { updatedAt: 'invalid' }],
      ['TTL', { expiresAt: undefined }],
      ['OutputFile', { outputFile: 1 }],
      ['ErrorMessage', { errorMessage: 1 }],
    ])('%s が不正なら InvalidEntityDataError にする', (_name, overrides) => {
      expect(() => mapper.toEntity(buildLegacyItem(overrides))).toThrow(InvalidEntityDataError);
    });
  });

  describe('legacyAttributeNames', () => {
    it('新名から旧名への対応をすべて宣言する', () => {
      expect(mapper.legacyAttributeNames).toEqual({
        Status: ['status'],
        InputFile: ['inputFile'],
        OutputFile: ['outputFile'],
        OutputCodec: ['outputCodec'],
        FileName: ['fileName'],
        FileSize: ['fileSize'],
        CreatedAt: ['createdAt'],
        UpdatedAt: ['updatedAt'],
        ErrorMessage: ['errorMessage'],
        TTL: ['expiresAt'],
      });
    });
  });

  describe('toUpdateAttributes', () => {
    it('空の patch では何も変更しない', () => {
      const attributes = mapper.toUpdateAttributes({});

      expect(Object.values(attributes).every((value) => value === undefined)).toBe(true);
    });

    it('status・outputFile・errorMessage を保存用の属性名に変換する', () => {
      expect(
        mapper.toUpdateAttributes({ status: 'FAILED', outputFile: 'o', errorMessage: 'e' })
      ).toMatchObject({ Status: 'FAILED', OutputFile: 'o', ErrorMessage: 'e' });
    });

    it('任意項目の null は属性の削除にする', () => {
      expect(mapper.toUpdateAttributes({ outputFile: null, errorMessage: null })).toMatchObject({
        OutputFile: REMOVE_ATTRIBUTE,
        ErrorMessage: REMOVE_ATTRIBUTE,
      });
    });

    it('expiresAt はエポック秒の TTL に変換する', () => {
      expect(mapper.toUpdateAttributes({ expiresAt: 1704153600999 }).TTL).toBe(1704153600);
    });

    it.each([
      ['status', { status: null }],
      ['expiresAt', { expiresAt: null }],
    ])('必須項目 %s の null は拒否する', (_name, patch) => {
      expect(() => mapper.toUpdateAttributes(patch)).toThrow(InvalidEntityDataError);
    });

    it.each([
      ['inputFile', { inputFile: 'x' }],
      ['outputCodec', { outputCodec: 'vp9' as const }],
      ['fileName', { fileName: 'x' }],
      ['fileSize', { fileSize: 1 }],
      ['createdAt', { createdAt: 1 }],
      ['null でも inputFile', { inputFile: null }],
    ])('作成後に変えられない項目 %s は拒否する', (_name, patch) => {
      expect(() => mapper.toUpdateAttributes(patch)).toThrow(InvalidEntityDataError);
    });
  });
});
