import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { JobMapper } from '../../../src/mappers/job.mapper.js';
import type { Job } from '../../../src/types.js';

const CREATED_AT = 1704067200000;
const EXPIRES_AT = 1704153600000;
const KEY = { jobId: 'job-1' };

function buildEntity(overrides: Partial<Job> = {}): Job {
  return {
    jobId: 'job-1',
    originalFileName: 'movie.mp4',
    fileSize: 1024,
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'JOB#job-1',
    SK: 'JOB#job-1',
    Type: 'JOB',
    JobID: 'job-1',
    OriginalFileName: 'movie.mp4',
    FileSize: 1024,
    CreatedAt: CREATED_AT,
    TTL: EXPIRES_AT / 1000,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

describe('JobMapper', () => {
  let mapper: JobMapper;

  beforeEach(() => {
    mapper = new JobMapper();
  });

  it('entityType は既存データと同じ JOB になる', () => {
    expect(mapper.entityType).toBe('JOB');
  });

  it('新属性名に対する旧 camelCase 名と TTL の旧名 expiresAt を宣言する', () => {
    expect(mapper.legacyAttributeNames).toEqual({
      JobID: ['jobId'],
      BatchJobID: ['batchJobId'],
      BatchStage: ['batchStage'],
      OriginalFileName: ['originalFileName'],
      FileSize: ['fileSize'],
      DurationSec: ['durationSec'],
      CreatedAt: ['createdAt'],
      ErrorMessage: ['errorMessage'],
      AnalysisProgress: ['analysisProgress'],
      TTL: ['expiresAt'],
    });
  });

  it('キーは PK と SK がどちらも JOB#<jobId> になる', () => {
    expect(mapper.buildKeys(KEY)).toEqual({ PK: 'JOB#job-1', SK: 'JOB#job-1' });
    expect(mapper.getKey(buildEntity())).toEqual(KEY);
  });

  describe('toItem / toEntity', () => {
    it('必須項目だけの Entity を PascalCase の Item に変換し、往復できる', () => {
      const item = mapper.toItem(buildEntity());

      expect(item).toEqual({
        PK: 'JOB#job-1',
        SK: 'JOB#job-1',
        Type: 'JOB',
        JobID: 'job-1',
        OriginalFileName: 'movie.mp4',
        FileSize: 1024,
        CreatedAt: CREATED_AT,
        TTL: EXPIRES_AT / 1000,
      });
      expect(mapper.toEntity({ ...item, UpdatedAt: CREATED_AT })).toEqual(buildEntity());
    });

    it('任意項目を含めて往復できる', () => {
      const entity = buildEntity({
        batchJobId: 'batch-1',
        batchStage: 'analyzing',
        durationSec: 120.5,
        errorMessage: '失敗',
        analysisProgress: {
          motion: { status: 'done', completed: 1, total: 1 },
          volume: { status: 'in_progress' },
        },
      });

      const item = mapper.toItem(entity);

      expect(item).toMatchObject({
        BatchJobID: 'batch-1',
        BatchStage: 'analyzing',
        DurationSec: 120.5,
        ErrorMessage: '失敗',
        AnalysisProgress: entity.analysisProgress,
      });
      expect(mapper.toEntity(item)).toEqual(entity);
    });

    it('TTL はミリ秒の expiresAt をエポック秒 (切り捨て) で保存する', () => {
      const item = mapper.toItem(buildEntity({ expiresAt: 1704153600999 }));

      expect(item.TTL).toBe(1704153600);
    });

    it('旧形式 (camelCase・エポック秒・expiresAt) の Item を読める', () => {
      const entity = mapper.toEntity({
        PK: 'JOB#job-1',
        SK: 'JOB#job-1',
        Type: 'JOB',
        jobId: 'job-1',
        batchJobId: 'batch-1',
        batchStage: 'clipping',
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        durationSec: 60,
        createdAt: CREATED_AT / 1000,
        expiresAt: EXPIRES_AT / 1000,
        errorMessage: 'エラー',
        analysisProgress: { motion: { status: 'done' }, volume: { status: 'done' } },
      });

      expect(entity).toEqual({
        jobId: 'job-1',
        batchJobId: 'batch-1',
        batchStage: 'clipping',
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        durationSec: 60,
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
        errorMessage: 'エラー',
        analysisProgress: { motion: { status: 'done' }, volume: { status: 'done' } },
      });
    });

    it('新名と旧名が両方あれば新名を優先する', () => {
      const entity = mapper.toEntity(buildItem({ originalFileName: 'old.mp4' }));

      expect(entity.originalFileName).toBe('movie.mp4');
    });

    it.each([
      ['JobID', undefined],
      ['OriginalFileName', 1],
      ['FileSize', '1024'],
      ['CreatedAt', undefined],
      ['TTL', undefined],
      ['BatchJobID', 1],
      ['BatchStage', 'unknown'],
      ['DurationSec', 'x'],
      ['ErrorMessage', 1],
      ['AnalysisProgress', 'x'],
      ['AnalysisProgress', ['x']],
    ])('%s が不正なら InvalidEntityDataError にする (%p)', (field, value) => {
      expect(() => mapper.toEntity(buildItem({ [field]: value }))).toThrow(InvalidEntityDataError);
    });
  });

  describe('toUpdateAttributes', () => {
    it('Entity の部分を保存用の属性名に変換する', () => {
      expect(
        mapper.toUpdateAttributes({
          batchJobId: 'batch-2',
          batchStage: 'aggregating',
          durationSec: 30,
          errorMessage: 'x',
          analysisProgress: { motion: { status: 'done' }, volume: { status: 'done' } },
          originalFileName: 'a.mp4',
          fileSize: 5,
          expiresAt: 1704153600999,
        })
      ).toMatchObject({
        BatchJobID: 'batch-2',
        BatchStage: 'aggregating',
        DurationSec: 30,
        ErrorMessage: 'x',
        AnalysisProgress: { motion: { status: 'done' }, volume: { status: 'done' } },
        OriginalFileName: 'a.mp4',
        FileSize: 5,
        TTL: 1704153600,
      });
    });

    it('変更のない項目は undefined になる', () => {
      const attributes = mapper.toUpdateAttributes({});

      expect(Object.values(attributes).every((value) => value === undefined)).toBe(true);
    });

    it('任意項目の null は属性の削除になる', () => {
      const attributes = mapper.toUpdateAttributes({
        batchJobId: null,
        batchStage: null,
        durationSec: null,
        errorMessage: null,
        analysisProgress: null,
      });

      expect(attributes.BatchJobID).toBe(REMOVE_ATTRIBUTE);
      expect(attributes.BatchStage).toBe(REMOVE_ATTRIBUTE);
      expect(attributes.DurationSec).toBe(REMOVE_ATTRIBUTE);
      expect(attributes.ErrorMessage).toBe(REMOVE_ATTRIBUTE);
      expect(attributes.AnalysisProgress).toBe(REMOVE_ATTRIBUTE);
    });

    it.each(['originalFileName', 'fileSize', 'expiresAt'] as const)(
      '必須項目 %s に null を渡すと InvalidEntityDataError にする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['jobId', 'job-1'],
      ['createdAt', CREATED_AT],
    ] as const)('変更不可の項目 %s を含むと、同じ値でも拒否する', (field, value) => {
      expect(() => mapper.toUpdateAttributes({ [field]: value })).toThrow(InvalidEntityDataError);
    });
  });
});
