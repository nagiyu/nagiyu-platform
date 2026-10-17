import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { WebRawMapper } from '../../../src/mappers/webraw.mapper.js';
import type { WebRawEntity } from '../../../src/entities/webraw.entity.js';

const TIMESTAMP = 1_700_000_000_000;
const KEY = { userId: 'u1', characterId: 'hiyori', rawId: 'RAW-1' };

function buildEntity(overrides: Partial<WebRawEntity> = {}): WebRawEntity {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    rawId: 'RAW-1',
    query: 'コーヒー',
    rawText: 'コーヒーの効能',
    sourceUrls: ['https://example.com'],
    origin: 'auto',
    createdAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: 'CHAR#hiyori#WEBRAW#RAW-1',
    Type: 'WebRaw',
    UserID: 'u1',
    CharacterID: 'hiyori',
    RawID: 'RAW-1',
    Query: 'コーヒー',
    RawText: 'コーヒーの効能',
    SourceUrls: ['https://example.com'],
    Origin: 'auto',
    CreatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('WebRawMapper', () => {
  const mapper = new WebRawMapper();

  it('entityType は WebRaw になる', () => {
    expect(mapper.entityType).toBe('WebRaw');
  });

  it('buildKeys は PK=USER#<userId> / SK=CHAR#<charId>#WEBRAW#<rawId> を PK 先頭の順で返す', () => {
    const keys = mapper.buildKeys(KEY);

    expect(keys).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#WEBRAW#RAW-1' });
    expect(Object.keys(keys)).toEqual(['PK', 'SK']);
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual(KEY);
  });

  describe('toItem', () => {
    it('保存形式の Item に変換し、expiresAt がなければ TTL を書かない', () => {
      const item = mapper.toItem(buildEntity());

      expect(item).toEqual(buildItem());
      expect(item).not.toHaveProperty('TTL');
      expect(item).not.toHaveProperty('UpdatedAt');
    });

    it('expiresAt (ミリ秒) を TTL 属性のエポック秒 (切り捨て) で書く', () => {
      expect(mapper.toItem(buildEntity({ expiresAt: 1_700_000_999_999 })).TTL).toBe(1_700_000_999);
    });

    it('依頼フックがあれば RequestText / RequestedAt を書く', () => {
      expect(
        mapper.toItem(
          buildEntity({ origin: 'request', requestText: '調べて', requestedAt: TIMESTAMP - 1 })
        )
      ).toMatchObject({ Origin: 'request', RequestText: '調べて', RequestedAt: TIMESTAMP - 1 });
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      expect(mapper.toUpdateAttributes({ query: 'q', origin: 'stale' })).toEqual({
        Query: 'q',
        Origin: 'stale',
      });
    });

    it('expiresAt はエポック秒に変換し、null なら TTL 属性を削除する', () => {
      expect(mapper.toUpdateAttributes({ expiresAt: 1_700_000_999_999 })).toEqual({
        TTL: 1_700_000_999,
      });
      expect(mapper.toUpdateAttributes({ expiresAt: null })).toEqual({ TTL: REMOVE_ATTRIBUTE });
    });

    it('依頼フックを null にすると属性を削除する', () => {
      expect(mapper.toUpdateAttributes({ requestText: null, requestedAt: null })).toMatchObject({
        RequestText: REMOVE_ATTRIBUTE,
        RequestedAt: REMOVE_ATTRIBUTE,
      });
    });

    it.each(['query', 'rawText', 'sourceUrls', 'origin'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['userId', { userId: 'u1' }],
      ['characterId', { characterId: 'hiyori' }],
      ['rawId', { rawId: 'RAW-1' }],
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

    it('TTL 属性のエポック秒をミリ秒の expiresAt に戻す', () => {
      expect(mapper.toEntity(buildItem({ TTL: 1_700_000_999 })).expiresAt).toBe(1_700_000_999_000);
    });

    it('依頼フックがあれば読む', () => {
      const entity = mapper.toEntity(
        buildItem({ Origin: 'request', RequestText: '調べて', RequestedAt: TIMESTAMP - 1 })
      );

      expect(entity.requestText).toBe('調べて');
      expect(entity.requestedAt).toBe(TIMESTAMP - 1);
    });

    it('Origin が無い旧データは auto として読む', () => {
      const item = buildItem();
      delete item.Origin;

      expect(mapper.toEntity(item).origin).toBe('auto');
    });

    it('sourceUrls が配列でなければ空配列にする', () => {
      expect(mapper.toEntity(buildItem({ SourceUrls: undefined })).sourceUrls).toEqual([]);
    });

    it('rawText は空文字を許可する', () => {
      expect(mapper.toEntity(buildItem({ RawText: '' })).rawText).toBe('');
    });

    it('旧形式の createdAt (ISO 文字列・エポック秒) をミリ秒で読む', () => {
      expect(
        mapper.toEntity(buildItem({ CreatedAt: new Date(TIMESTAMP).toISOString() })).createdAt
      ).toBe(TIMESTAMP);
      expect(mapper.toEntity(buildItem({ CreatedAt: TIMESTAMP / 1000 })).createdAt).toBe(TIMESTAMP);
    });

    it.each(['UserID', 'CharacterID', 'RawID', 'Query', 'RawText', 'CreatedAt'])(
      '必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする',
      (field) => {
        const item = buildItem();
        delete item[field];

        expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      }
    );
  });

  it('Entity -> Item -> Entity の変換で元に戻る', () => {
    const original = buildEntity({
      origin: 'request',
      requestText: '調べて',
      requestedAt: TIMESTAMP - 1,
      expiresAt: 1_700_000_999_000,
    });

    expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
  });
});
