import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { NotificationEventMapper } from '../../../src/mappers/notification-event.mapper.js';
import type { NotificationEventEntity } from '../../../src/entities/notification-event.entity.js';

const TIMESTAMP = 1_700_000_000_000;
const EXPIRES_AT = 1_700_000_999_000;

function buildEntity(overrides: Partial<NotificationEventEntity> = {}): NotificationEventEntity {
  return {
    userId: 'u1',
    notifId: 'NOTIF-001',
    characterId: 'hiyori',
    kind: 'normal',
    title: 'テスト通知',
    body: 'テスト本文',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: 'NOTIF#NOTIF-001',
    Type: 'NotificationEvent',
    UserID: 'u1',
    NotifID: 'NOTIF-001',
    CharacterID: 'hiyori',
    Kind: 'normal',
    Title: 'テスト通知',
    Body: 'テスト本文',
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    TTL: EXPIRES_AT / 1000,
    ...overrides,
  };
}

describe('NotificationEventMapper', () => {
  const mapper = new NotificationEventMapper();

  it('entityType は NotificationEvent になる', () => {
    expect(mapper.entityType).toBe('NotificationEvent');
  });

  it('旧属性名 Ttl を TTL の旧名として宣言する', () => {
    expect(mapper.legacyAttributeNames).toEqual({ TTL: ['Ttl'] });
  });

  it('buildKeys は PK=USER#<userId> / SK=NOTIF#<notifId> を PK 先頭の順で返す', () => {
    const keys = mapper.buildKeys({ userId: 'u1', notifId: 'NOTIF-001' });

    expect(keys).toEqual({ PK: 'USER#u1', SK: 'NOTIF#NOTIF-001' });
    expect(Object.keys(keys)).toEqual(['PK', 'SK']);
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual({ userId: 'u1', notifId: 'NOTIF-001' });
  });

  describe('toItem', () => {
    it('保存形式 (PascalCase・キー・Type) の Item に変換し、expiresAt を TTL のエポック秒で書く', () => {
      const item = mapper.toItem(buildEntity());

      expect(item).toEqual(buildItem());
      expect(item).not.toHaveProperty('Ttl');
    });

    it('expiresAt のミリ秒は切り捨ててエポック秒にする', () => {
      expect(mapper.toItem(buildEntity({ expiresAt: 1_700_000_999_999 })).TTL).toBe(1_700_000_999);
    });

    it('任意項目があれば書き、なければ書かない', () => {
      const withOptionals = mapper.toItem(
        buildEntity({ topicId: 'tp1', suggestedReply: '教えて', consumedAt: TIMESTAMP + 1000 })
      );
      expect(withOptionals).toMatchObject({
        TopicID: 'tp1',
        SuggestedReply: '教えて',
        ConsumedAt: TIMESTAMP + 1000,
      });

      const without = mapper.toItem(buildEntity());
      expect(without).not.toHaveProperty('TopicID');
      expect(without).not.toHaveProperty('SuggestedReply');
      expect(without).not.toHaveProperty('ConsumedAt');
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      expect(mapper.toUpdateAttributes({ consumedAt: TIMESTAMP + 1000 })).toEqual({
        ConsumedAt: TIMESTAMP + 1000,
      });
    });

    it('expiresAt はエポック秒に変換して TTL に書く', () => {
      expect(mapper.toUpdateAttributes({ expiresAt: 1_700_000_999_999 })).toEqual({
        TTL: 1_700_000_999,
      });
    });

    it('任意項目の null は属性の削除にする', () => {
      expect(
        mapper.toUpdateAttributes({ topicId: null, suggestedReply: null, consumedAt: null })
      ).toEqual({
        TopicID: REMOVE_ATTRIBUTE,
        SuggestedReply: REMOVE_ATTRIBUTE,
        ConsumedAt: REMOVE_ATTRIBUTE,
      });
    });

    it.each(['characterId', 'kind', 'title', 'body', 'expiresAt'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['userId', { userId: 'u1' }],
      ['notifId', { notifId: 'NOTIF-001' }],
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

    it('任意項目を読む', () => {
      const entity = mapper.toEntity(
        buildItem({
          TopicID: 'tp1',
          SuggestedReply: '教えて',
          ConsumedAt: TIMESTAMP + 1000,
        })
      );

      expect(entity).toMatchObject({
        topicId: 'tp1',
        suggestedReply: '教えて',
        consumedAt: TIMESTAMP + 1000,
      });
    });

    it('CharacterID が欠落した旧データは hiyori として読む', () => {
      const item = buildItem();
      delete item.CharacterID;

      expect(mapper.toEntity(item).characterId).toBe('hiyori');
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

    it('旧属性名 Ttl だけの Item も expiresAt として読む', () => {
      const item = buildItem({ Ttl: 1_700_000_111 });
      delete item.TTL;

      expect(mapper.toEntity(item).expiresAt).toBe(1_700_000_111_000);
    });

    it('新名 TTL と旧名 Ttl が両方あれば新名を優先する', () => {
      const entity = mapper.toEntity(buildItem({ TTL: 1_700_000_999, Ttl: 1_700_000_111 }));

      expect(entity.expiresAt).toBe(1_700_000_999_000);
    });

    it('Kind が不正な場合は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ Kind: 'urgent' }))).toThrow(InvalidEntityDataError);
    });

    it.each(['UserID', 'NotifID', 'Kind', 'Title', 'Body', 'CreatedAt', 'UpdatedAt', 'TTL'])(
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
      topicId: 'tp1',
      suggestedReply: '教えて',
      consumedAt: TIMESTAMP + 1000,
    });

    expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
  });
});
