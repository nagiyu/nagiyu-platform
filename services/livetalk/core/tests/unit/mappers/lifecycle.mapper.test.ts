import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { LifecycleMapper } from '../../../src/mappers/lifecycle.mapper.js';
import type { LifecycleEntity } from '../../../src/entities/lifecycle.entity.js';

const TIMESTAMP = 1_700_000_000_000;

const activityProfile = {
  morningPeak: '08:00',
  eveningPeak: '21:00',
  sampleSize: 42,
  lastLearnedAt: '2026-06-01T00:00:00.000Z',
};

function buildEntity(overrides: Partial<LifecycleEntity> = {}): LifecycleEntity {
  return {
    userId: 'google-12345',
    characterId: 'hiyori',
    bedtime: '01:30',
    wakeUpTime: '09:30',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#google-12345',
    SK: 'CHAR#hiyori#LIFECYCLE',
    Type: 'Lifecycle',
    UserID: 'google-12345',
    CharacterID: 'hiyori',
    Bedtime: '01:30',
    WakeUpTime: '09:30',
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('LifecycleMapper', () => {
  const mapper = new LifecycleMapper();

  it('entityType は Lifecycle になる', () => {
    expect(mapper.entityType).toBe('Lifecycle');
  });

  it('buildKeys は PK=USER#<userId> / SK=CHAR#<characterId>#LIFECYCLE を PK 先頭の順で返す', () => {
    const keys = mapper.buildKeys({ userId: 'google-12345', characterId: 'hiyori' });

    expect(keys).toEqual({ PK: 'USER#google-12345', SK: 'CHAR#hiyori#LIFECYCLE' });
    expect(Object.keys(keys)).toEqual(['PK', 'SK']);
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual({
      userId: 'google-12345',
      characterId: 'hiyori',
    });
  });

  describe('toItem', () => {
    it('保存形式 (PascalCase・キー・Type) の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual(buildItem());
    });

    it('userActivityProfile は保存側でもそのままの形で書く', () => {
      const item = mapper.toItem(buildEntity({ userActivityProfile: activityProfile }));

      expect(item.UserActivityProfile).toEqual(activityProfile);
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      expect(mapper.toUpdateAttributes({ bedtime: '02:00', wakeUpTime: '10:00' })).toEqual({
        Bedtime: '02:00',
        WakeUpTime: '10:00',
      });
    });

    it('userActivityProfile を null にすると属性の削除になる', () => {
      expect(mapper.toUpdateAttributes({ userActivityProfile: null }).UserActivityProfile).toBe(
        REMOVE_ATTRIBUTE
      );
    });

    it.each(['bedtime', 'wakeUpTime'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['userId', { userId: 'google-12345' }],
      ['characterId', { characterId: 'hiyori' }],
      ['createdAt', { createdAt: TIMESTAMP }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes)).toThrow(InvalidEntityDataError);
      }
    );
  });

  describe('toEntity', () => {
    it('Item を camelCase の Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('UserActivityProfile がない Item では userActivityProfile を含めない', () => {
      expect(mapper.toEntity(buildItem()).userActivityProfile).toBeUndefined();
    });

    it('UserActivityProfile を読む。sampleSize が数値でなければ 0 になる', () => {
      const entity = mapper.toEntity(
        buildItem({ UserActivityProfile: { ...activityProfile, sampleSize: 'x' } })
      );

      expect(entity.userActivityProfile).toEqual({ ...activityProfile, sampleSize: 0 });
    });

    it.each([
      ['オブジェクトでない', 'invalid'],
      ['null', null],
      ['morningPeak が欠けている', { ...activityProfile, morningPeak: undefined }],
    ])('UserActivityProfile が %s と InvalidEntityDataError をスローする', (_name, stored) => {
      expect(() => mapper.toEntity(buildItem({ UserActivityProfile: stored }))).toThrow(
        InvalidEntityDataError
      );
    });

    it('時刻が ISO 文字列で保存された旧形式のデータもミリ秒で読める', () => {
      const entity = mapper.toEntity(
        buildItem({
          CreatedAt: new Date(TIMESTAMP).toISOString(),
          UpdatedAt: new Date(TIMESTAMP).toISOString(),
        })
      );

      expect(entity.createdAt).toBe(TIMESTAMP);
      expect(entity.updatedAt).toBe(TIMESTAMP);
    });

    it.each(['UserID', 'CharacterID', 'Bedtime', 'WakeUpTime', 'CreatedAt', 'UpdatedAt'])(
      '必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする',
      (field) => {
        const item = buildItem();
        delete item[field];

        expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      }
    );
  });

  it('Entity -> Item -> Entity の変換で元に戻る (userActivityProfile あり・なし)', () => {
    for (const original of [buildEntity(), buildEntity({ userActivityProfile: activityProfile })]) {
      expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
    }
  });
});
