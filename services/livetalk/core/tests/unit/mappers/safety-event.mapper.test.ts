import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { SafetyEventMapper } from '../../../src/mappers/safety-event.mapper.js';
import type { SafetyEventEntity } from '../../../src/entities/safety-event.entity.js';

const TIMESTAMP = 1_700_000_000_000;
const EVENT_ID = '01J9Z000000000000000000001';

function buildEntity(overrides: Partial<SafetyEventEntity> = {}): SafetyEventEntity {
  return {
    userId: 'u1',
    eventId: EVENT_ID,
    characterId: 'hiyori',
    trigger: 'input_keyword',
    detectedPattern: '[自傷] 死にたい',
    inputText: '死にたい',
    responseText: '大丈夫だよ',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: `SAFETY#${EVENT_ID}`,
    Type: 'SafetyEvent',
    UserID: 'u1',
    EventID: EVENT_ID,
    CharacterID: 'hiyori',
    Trigger: 'input_keyword',
    DetectedPattern: '[自傷] 死にたい',
    InputText: '死にたい',
    ResponseText: '大丈夫だよ',
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    GSI2PK: 'SAFETY',
    GSI2SK: EVENT_ID,
    ...overrides,
  };
}

describe('SafetyEventMapper', () => {
  const mapper = new SafetyEventMapper();

  it('entityType は SafetyEvent になる', () => {
    expect(mapper.entityType).toBe('SafetyEvent');
  });

  it('buildKeys は PK=USER#<userId> / SK=SAFETY#<ulid> を PK 先頭の順で返す', () => {
    const keys = mapper.buildKeys({ userId: 'u1', eventId: EVENT_ID });

    expect(keys).toEqual({ PK: 'USER#u1', SK: `SAFETY#${EVENT_ID}` });
    expect(Object.keys(keys)).toEqual(['PK', 'SK']);
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual({ userId: 'u1', eventId: EVENT_ID });
  });

  describe('toItem', () => {
    it('保存形式 (PascalCase・キー・Type・GSI2) の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual(buildItem());
    });

    it('任意項目がなければ属性ごと書かない', () => {
      const item = mapper.toItem(buildEntity({ characterId: undefined }));

      expect(item).not.toHaveProperty('CharacterID');
      expect(item).not.toHaveProperty('ModerationCategories');
    });

    it('moderationCategories があれば ModerationCategories を書く', () => {
      expect(mapper.toItem(buildEntity({ moderationCategories: '{"hate":true}' }))).toMatchObject({
        ModerationCategories: '{"hate":true}',
      });
    });
  });

  describe('toUpdateAttributes', () => {
    const key = { userId: 'u1', eventId: EVENT_ID };

    it('GSI2 の属性を key から付け直し、指定した項目を保存用の属性名に変換する', () => {
      expect(mapper.toUpdateAttributes({ detectedPattern: '更新' }, key)).toEqual({
        DetectedPattern: '更新',
        GSI2PK: 'SAFETY',
        GSI2SK: EVENT_ID,
      });
    });

    it('任意項目を null にすると属性を削除する', () => {
      expect(
        mapper.toUpdateAttributes({ characterId: null, moderationCategories: null }, key)
      ).toMatchObject({ CharacterID: REMOVE_ATTRIBUTE, ModerationCategories: REMOVE_ATTRIBUTE });
    });

    it.each(['trigger', 'detectedPattern', 'inputText', 'responseText'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null }, key)).toThrow(
          InvalidEntityDataError
        );
      }
    );

    it.each([
      ['userId', { userId: 'u1' }],
      ['eventId', { eventId: EVENT_ID }],
      ['createdAt', { createdAt: TIMESTAMP }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes, key)).toThrow(InvalidEntityDataError);
      }
    );
  });

  describe('toEntity', () => {
    it('Item を camelCase の Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('CharacterID のない旧データを読める', () => {
      const item = buildItem();
      delete item.CharacterID;

      expect(mapper.toEntity(item)).not.toHaveProperty('characterId');
    });

    it('空文字の入力・応答を許可する', () => {
      const entity = mapper.toEntity(buildItem({ InputText: '', ResponseText: '' }));

      expect(entity.inputText).toBe('');
      expect(entity.responseText).toBe('');
    });

    it('ModerationCategories を moderationCategories に読む', () => {
      expect(mapper.toEntity(buildItem({ ModerationCategories: '{}' })).moderationCategories).toBe(
        '{}'
      );
    });

    it('旧形式の時刻 (ISO 文字列・エポック秒) をミリ秒で読む', () => {
      const entity = mapper.toEntity(
        buildItem({ CreatedAt: new Date(TIMESTAMP).toISOString(), UpdatedAt: TIMESTAMP / 1000 })
      );

      expect(entity.createdAt).toBe(TIMESTAMP);
      expect(entity.updatedAt).toBe(TIMESTAMP);
    });

    it.each([
      'UserID',
      'EventID',
      'Trigger',
      'DetectedPattern',
      'InputText',
      'ResponseText',
      'CreatedAt',
      'UpdatedAt',
    ])('必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする', (field) => {
      const item = buildItem();
      delete item[field];

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });
  });

  describe('toSummary', () => {
    it('GSI2 の射影項目だけを camelCase で返し、PII を含まない', () => {
      const summary = mapper.toSummary(buildItem());

      expect(summary).toEqual({
        userId: 'u1',
        eventId: EVENT_ID,
        characterId: 'hiyori',
        trigger: 'input_keyword',
        detectedPattern: '[自傷] 死にたい',
        createdAt: TIMESTAMP,
      });
    });

    it('CharacterID がなければ characterId を持たない', () => {
      const item = buildItem();
      delete item.CharacterID;

      expect(mapper.toSummary(item)).not.toHaveProperty('characterId');
    });

    it('旧形式の時刻 (ISO 文字列) をミリ秒で読む', () => {
      expect(
        mapper.toSummary(buildItem({ CreatedAt: new Date(TIMESTAMP).toISOString() })).createdAt
      ).toBe(TIMESTAMP);
    });
  });

  it('Entity -> Item -> Entity の変換で元に戻る', () => {
    const original = buildEntity({ moderationCategories: '{}' });

    expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
  });
});
