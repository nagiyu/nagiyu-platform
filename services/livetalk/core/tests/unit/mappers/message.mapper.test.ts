import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { MessageMapper } from '../../../src/mappers/message.mapper.js';
import type { MessageEntity } from '../../../src/entities/message.entity.js';

const TIMESTAMP = 1_700_000_000_000;

function buildEntity(overrides: Partial<MessageEntity> = {}): MessageEntity {
  return {
    userId: 'google-12345',
    characterId: 'hiyori',
    messageId: '01J9Z000000000000000000001',
    role: 'user',
    text: 'こんにちは',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#google-12345',
    SK: 'CHAR#hiyori#MSG#01J9Z000000000000000000001',
    Type: 'Message',
    UserID: 'google-12345',
    CharacterID: 'hiyori',
    MessageID: '01J9Z000000000000000000001',
    Role: 'user',
    Text: 'こんにちは',
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('MessageMapper', () => {
  const mapper = new MessageMapper();

  it('entityType は Message になる', () => {
    expect(mapper.entityType).toBe('Message');
  });

  it('buildKeys は PK=USER#<userId> / SK=CHAR#<charId>#MSG#<ulid> を PK 先頭の順で返す', () => {
    const keys = mapper.buildKeys({
      userId: 'google-12345',
      characterId: 'hiyori',
      messageId: '01J9Z',
    });

    expect(keys).toEqual({ PK: 'USER#google-12345', SK: 'CHAR#hiyori#MSG#01J9Z' });
    expect(Object.keys(keys)).toEqual(['PK', 'SK']);
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual({
      userId: 'google-12345',
      characterId: 'hiyori',
      messageId: '01J9Z000000000000000000001',
    });
  });

  describe('toItem', () => {
    it('保存形式 (PascalCase・キー・Type) の Item に変換し、expiresAt がなければ TTL を書かない', () => {
      const item = mapper.toItem(buildEntity());

      expect(item).toEqual(buildItem());
      expect(item).not.toHaveProperty('TTL');
    });

    it('expiresAt (ミリ秒) を TTL 属性のエポック秒 (切り捨て) で書く', () => {
      const item = mapper.toItem(buildEntity({ expiresAt: 1_700_000_999_999 }));

      expect(item.TTL).toBe(1_700_000_999);
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      expect(mapper.toUpdateAttributes({ text: '更新後' })).toEqual({ Text: '更新後' });
    });

    it('expiresAt はエポック秒に変換し、null なら TTL 属性を削除する', () => {
      expect(mapper.toUpdateAttributes({ expiresAt: 1_700_000_999_999 })).toEqual({
        TTL: 1_700_000_999,
      });
      expect(mapper.toUpdateAttributes({ expiresAt: null })).toEqual({ TTL: REMOVE_ATTRIBUTE });
    });

    it.each(['role', 'text'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['userId', { userId: 'google-12345' }],
      ['characterId', { characterId: 'hiyori' }],
      ['messageId', { messageId: '01J9Z' }],
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

    it('空文字の本文を許可する', () => {
      expect(mapper.toEntity(buildItem({ Text: '' })).text).toBe('');
    });

    it('旧形式の時刻 (ISO 文字列・エポック秒) をミリ秒で読む', () => {
      const entity = mapper.toEntity(
        buildItem({ CreatedAt: new Date(TIMESTAMP).toISOString(), UpdatedAt: TIMESTAMP / 1000 })
      );

      expect(entity.createdAt).toBe(TIMESTAMP);
      expect(entity.updatedAt).toBe(TIMESTAMP);
    });

    it('TTL 属性のエポック秒をミリ秒の expiresAt に戻す', () => {
      expect(mapper.toEntity(buildItem({ TTL: 1_700_000_999 })).expiresAt).toBe(1_700_000_999_000);
    });

    it('TTL 属性がなければ expiresAt を持たない', () => {
      expect(mapper.toEntity(buildItem())).not.toHaveProperty('expiresAt');
    });

    it('Role が不正な場合は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ Role: 'system' }))).toThrow(InvalidEntityDataError);
    });

    it.each(['UserID', 'CharacterID', 'MessageID', 'Role', 'Text', 'CreatedAt', 'UpdatedAt'])(
      '必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする',
      (field) => {
        const item = buildItem();
        delete item[field];

        expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      }
    );
  });

  it('Entity -> Item -> Entity の変換で元に戻る', () => {
    const original = buildEntity({ expiresAt: 1_700_000_999_000 });

    expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
  });
});
