import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { HighlightMapper } from '../../../src/mappers/highlight.mapper.js';
import type { Highlight } from '../../../src/types.js';

const EXPIRES_AT = 1704153600000;
const KEY = { jobId: 'job-1', highlightId: 'h-1' };

function buildEntity(overrides: Partial<Highlight> = {}): Highlight {
  return {
    highlightId: 'h-1',
    jobId: 'job-1',
    order: 1,
    startSec: 10,
    endSec: 20,
    source: 'motion',
    status: 'unconfirmed',
    clipStatus: 'PENDING',
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'JOB#job-1',
    SK: 'HIGHLIGHT#h-1',
    Type: 'HIGHLIGHT',
    HighlightID: 'h-1',
    JobID: 'job-1',
    Order: 1,
    StartSec: 10,
    EndSec: 20,
    Source: 'motion',
    Status: 'unconfirmed',
    ClipStatus: 'PENDING',
    TTL: EXPIRES_AT / 1000,
    UpdatedAt: EXPIRES_AT,
    ...overrides,
  };
}

describe('HighlightMapper', () => {
  let mapper: HighlightMapper;

  beforeEach(() => {
    mapper = new HighlightMapper();
  });

  it('entityType は既存データと同じ HIGHLIGHT になる', () => {
    expect(mapper.entityType).toBe('HIGHLIGHT');
  });

  it('新属性名に対する旧 camelCase 名と TTL の旧名 expiresAt を宣言する', () => {
    expect(mapper.legacyAttributeNames).toEqual({
      HighlightID: ['highlightId'],
      JobID: ['jobId'],
      Order: ['order'],
      StartSec: ['startSec'],
      EndSec: ['endSec'],
      Source: ['source'],
      Status: ['status'],
      ClipStatus: ['clipStatus'],
      DominantEmotion: ['dominantEmotion'],
      TTL: ['expiresAt'],
    });
  });

  it('キーは PK が JOB#<jobId>、SK が HIGHLIGHT#<highlightId> になる', () => {
    expect(mapper.buildKeys(KEY)).toEqual({ PK: 'JOB#job-1', SK: 'HIGHLIGHT#h-1' });
    expect(mapper.getKey(buildEntity())).toEqual(KEY);
  });

  describe('toItem / toEntity', () => {
    it('Entity を PascalCase の Item に変換し、往復できる', () => {
      const item = mapper.toItem(buildEntity());

      expect(item).toEqual({
        PK: 'JOB#job-1',
        SK: 'HIGHLIGHT#h-1',
        Type: 'HIGHLIGHT',
        HighlightID: 'h-1',
        JobID: 'job-1',
        Order: 1,
        StartSec: 10,
        EndSec: 20,
        Source: 'motion',
        Status: 'unconfirmed',
        ClipStatus: 'PENDING',
        TTL: EXPIRES_AT / 1000,
      });
      expect(mapper.toEntity(item)).toEqual(buildEntity());
    });

    it('dominantEmotion を含めて往復できる', () => {
      const entity = buildEntity({ source: 'emotion', dominantEmotion: 'laugh' });

      const item = mapper.toItem(entity);

      expect(item.DominantEmotion).toBe('laugh');
      expect(mapper.toEntity(item)).toEqual(entity);
    });

    it('TTL はミリ秒の expiresAt をエポック秒 (切り捨て) で保存する', () => {
      expect(mapper.toItem(buildEntity({ expiresAt: 1704153600999 })).TTL).toBe(1704153600);
    });

    it('旧形式 (camelCase・expiresAt) の Item を読める', () => {
      const entity = mapper.toEntity({
        PK: 'JOB#job-1',
        SK: 'HIGHLIGHT#h-1',
        Type: 'HIGHLIGHT',
        highlightId: 'h-1',
        jobId: 'job-1',
        order: 2,
        startSec: 1,
        endSec: 2,
        source: 'both',
        status: 'accepted',
        clipStatus: 'GENERATED',
        dominantEmotion: 'touch',
        expiresAt: EXPIRES_AT / 1000,
      });

      expect(entity).toEqual({
        highlightId: 'h-1',
        jobId: 'job-1',
        order: 2,
        startSec: 1,
        endSec: 2,
        source: 'both',
        status: 'accepted',
        clipStatus: 'GENERATED',
        dominantEmotion: 'touch',
        expiresAt: EXPIRES_AT,
      });
    });

    it.each([
      ['HighlightID', undefined],
      ['JobID', 1],
      ['Order', '1'],
      ['StartSec', undefined],
      ['EndSec', 'x'],
      ['Source', 'unknown'],
      ['Status', 'unknown'],
      ['ClipStatus', 'unknown'],
      ['DominantEmotion', 'unknown'],
      ['TTL', undefined],
    ])('%s が不正なら InvalidEntityDataError にする (%p)', (field, value) => {
      expect(() => mapper.toEntity(buildItem({ [field]: value }))).toThrow(InvalidEntityDataError);
    });
  });

  describe('toUpdateAttributes', () => {
    it('Entity の部分を保存用の属性名に変換する', () => {
      expect(
        mapper.toUpdateAttributes({
          order: 3,
          startSec: 1,
          endSec: 2,
          source: 'volume',
          status: 'accepted',
          clipStatus: 'GENERATED',
          dominantEmotion: 'excite',
          expiresAt: 1704153600999,
        })
      ).toMatchObject({
        Order: 3,
        StartSec: 1,
        EndSec: 2,
        Source: 'volume',
        Status: 'accepted',
        ClipStatus: 'GENERATED',
        DominantEmotion: 'excite',
        TTL: 1704153600,
      });
    });

    it('変更のない項目は undefined になる', () => {
      const attributes = mapper.toUpdateAttributes({});

      expect(Object.values(attributes).every((value) => value === undefined)).toBe(true);
    });

    it('dominantEmotion の null は属性の削除になる', () => {
      expect(mapper.toUpdateAttributes({ dominantEmotion: null }).DominantEmotion).toBe(
        REMOVE_ATTRIBUTE
      );
    });

    it.each([
      'order',
      'startSec',
      'endSec',
      'source',
      'status',
      'clipStatus',
      'expiresAt',
    ] as const)('必須項目 %s に null を渡すと InvalidEntityDataError にする', (field) => {
      expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
    });

    it.each([
      ['highlightId', 'h-1'],
      ['jobId', 'job-1'],
    ] as const)('変更不可の項目 %s を含むと、同じ値でも拒否する', (field, value) => {
      expect(() => mapper.toUpdateAttributes({ [field]: value })).toThrow(InvalidEntityDataError);
    });
  });
});
