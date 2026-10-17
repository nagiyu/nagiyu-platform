import { describe, it, expect } from '@jest/globals';
import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import {
  PushSubscriptionMapper,
  buildEndpointGsi2Pk,
} from '../../../src/notify/subscription-mapper.js';
import type { PushSubscriptionRecord } from '../../../src/notify/subscription-types.js';

const CREATED_AT = 1767225600000; // 2026-01-01T00:00:00.000Z
const UPDATED_AT = 1767229200000; // 2026-01-01T01:00:00.000Z

function buildRecord(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    subscriptionId: 'sub-1',
    userId: 'admin-user-1',
    subscription: {
      endpoint: 'https://example.com/endpoint-1',
      keys: { p256dh: 'p256dh-1', auth: 'auth-1' },
    },
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildLegacyItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'SUBSCRIPTION#sub-1',
    SK: 'SUBSCRIPTION#sub-1',
    Type: 'Subscription',
    GSI1PK: 'USER#admin-user-1',
    GSI1SK: 'SUBSCRIPTION#sub-1',
    GSI2PK: 'ENDPOINT#hash',
    subscriptionId: 'sub-1',
    userId: 'admin-user-1',
    endpoint: 'https://example.com/endpoint-1',
    p256dhKey: 'p256dh-1',
    authKey: 'auth-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T01:00:00.000Z',
    ...overrides,
  };
}

describe('PushSubscriptionMapper', () => {
  const mapper = new PushSubscriptionMapper();

  describe('toItem', () => {
    it('PascalCase の属性名とミリ秒の時刻、既存のキー・GSI 属性で保存する', () => {
      const item = mapper.toItem(buildRecord());

      expect(item).toEqual({
        PK: 'SUBSCRIPTION#sub-1',
        SK: 'SUBSCRIPTION#sub-1',
        Type: 'Subscription',
        GSI1PK: 'USER#admin-user-1',
        GSI1SK: 'SUBSCRIPTION#sub-1',
        GSI2PK: buildEndpointGsi2Pk('https://example.com/endpoint-1'),
        SubscriptionID: 'sub-1',
        UserID: 'admin-user-1',
        Endpoint: 'https://example.com/endpoint-1',
        P256dhKey: 'p256dh-1',
        AuthKey: 'auth-1',
        CreatedAt: CREATED_AT,
        UpdatedAt: UPDATED_AT,
      });
    });

    it('GSI2PK は endpoint の SHA-256 ハッシュになる', () => {
      expect(buildEndpointGsi2Pk('https://example.com/endpoint-1')).toMatch(
        /^ENDPOINT#[0-9a-f]{64}$/
      );
    });

    it.each([
      ['subscriptionId', { subscriptionId: '' }, 'subscriptionId は空文字にできません'],
      ['userId', { userId: '' }, 'userId は空文字にできません'],
      [
        'endpoint',
        { subscription: { endpoint: '', keys: { p256dh: 'a', auth: 'b' } } },
        'endpoint は空文字にできません',
      ],
      [
        'p256dhKey',
        { subscription: { endpoint: 'https://e', keys: { p256dh: '', auth: 'b' } } },
        'p256dhKey は空文字にできません',
      ],
      [
        'authKey',
        { subscription: { endpoint: 'https://e', keys: { p256dh: 'a', auth: '' } } },
        'authKey は空文字にできません',
      ],
    ])('%s が空文字なら InvalidEntityDataError にする', (_name, overrides, message) => {
      expect(() => mapper.toItem(buildRecord(overrides))).toThrow(InvalidEntityDataError);
      expect(() => mapper.toItem(buildRecord(overrides))).toThrow(message);
    });
  });

  describe('toEntity', () => {
    it('新形式の Item を読める', () => {
      const record = buildRecord();

      expect(mapper.toEntity(mapper.toItem(record))).toEqual(record);
    });

    it('旧属性名と ISO 文字列の時刻の Item を読み、時刻をミリ秒にする', () => {
      expect(mapper.toEntity(buildLegacyItem())).toEqual(buildRecord());
    });

    it('新名と旧名が併存するときは新名を優先する', () => {
      const item = buildLegacyItem({
        SubscriptionID: 'sub-new',
        UserID: 'user-new',
        Endpoint: 'https://example.com/new',
        P256dhKey: 'p256dh-new',
        AuthKey: 'auth-new',
        CreatedAt: CREATED_AT + 1,
        UpdatedAt: UPDATED_AT + 1,
      });

      expect(mapper.toEntity(item)).toEqual({
        subscriptionId: 'sub-new',
        userId: 'user-new',
        subscription: {
          endpoint: 'https://example.com/new',
          keys: { p256dh: 'p256dh-new', auth: 'auth-new' },
        },
        createdAt: CREATED_AT + 1,
        updatedAt: UPDATED_AT + 1,
      });
    });

    it('必須の属性がなければ InvalidEntityDataError にする', () => {
      const item = buildLegacyItem();
      delete item.authKey;

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('時刻が不正な文字列なら InvalidEntityDataError にする', () => {
      expect(() => mapper.toEntity(buildLegacyItem({ createdAt: 'not-a-date' }))).toThrow(
        InvalidEntityDataError
      );
    });
  });

  describe('legacyAttributeNames', () => {
    it('すべての保存属性に旧名 (小文字始まり) を宣言している', () => {
      expect(mapper.legacyAttributeNames).toEqual({
        SubscriptionID: ['subscriptionId'],
        UserID: ['userId'],
        Endpoint: ['endpoint'],
        P256dhKey: ['p256dhKey'],
        AuthKey: ['authKey'],
        CreatedAt: ['createdAt'],
        UpdatedAt: ['updatedAt'],
      });
    });
  });

  describe('keyFromItem', () => {
    it('PK から subscriptionId を取り出す', () => {
      expect(mapper.keyFromItem({ PK: 'SUBSCRIPTION#sub-9' })).toEqual({
        subscriptionId: 'sub-9',
      });
    });

    it('PK が購読の形式でなければ InvalidEntityDataError にする', () => {
      expect(() => mapper.keyFromItem({ PK: 'USER#x' })).toThrow(InvalidEntityDataError);
      expect(() => mapper.keyFromItem({})).toThrow(InvalidEntityDataError);
    });
  });

  describe('toUpdateAttributes', () => {
    it('userId を変えると GSI1PK を付け直し、GSI1SK はキーから作る', () => {
      const attributes = mapper.toUpdateAttributes(
        { userId: 'user-2' },
        { subscriptionId: 'sub-1' }
      );

      expect(attributes).toMatchObject({
        UserID: 'user-2',
        GSI1PK: 'USER#user-2',
        GSI1SK: 'SUBSCRIPTION#sub-1',
      });
      expect(attributes.GSI2PK).toBeUndefined();
    });

    it('subscription を変えると endpoint・鍵・GSI2PK を付け直す', () => {
      const attributes = mapper.toUpdateAttributes(
        {
          subscription: { endpoint: 'https://example.com/next', keys: { p256dh: 'p', auth: 'a' } },
        },
        { subscriptionId: 'sub-1' }
      );

      expect(attributes).toMatchObject({
        Endpoint: 'https://example.com/next',
        P256dhKey: 'p',
        AuthKey: 'a',
        GSI2PK: buildEndpointGsi2Pk('https://example.com/next'),
      });
      expect(attributes.GSI1PK).toBeUndefined();
    });

    it('必須項目を null にすると InvalidEntityDataError にする', () => {
      expect(() =>
        mapper.toUpdateAttributes({ userId: null }, { subscriptionId: 'sub-1' })
      ).toThrow(InvalidEntityDataError);
      expect(() =>
        mapper.toUpdateAttributes({ subscription: null }, { subscriptionId: 'sub-1' })
      ).toThrow(InvalidEntityDataError);
    });

    it('作成後に変えられない項目を含めると InvalidEntityDataError にする', () => {
      expect(() =>
        mapper.toUpdateAttributes({ subscriptionId: 'sub-2' }, { subscriptionId: 'sub-1' })
      ).toThrow(InvalidEntityDataError);
      expect(() =>
        mapper.toUpdateAttributes({ createdAt: 1 }, { subscriptionId: 'sub-1' })
      ).toThrow(InvalidEntityDataError);
    });

    it('REMOVE_ATTRIBUTE を返さない (削除できる任意項目がない)', () => {
      const attributes = mapper.toUpdateAttributes({}, { subscriptionId: 'sub-1' });

      expect(Object.values(attributes)).not.toContain(REMOVE_ATTRIBUTE);
    });
  });

  describe('splitReadable', () => {
    it('読めない Item を除き、PK と理由を返す', () => {
      const broken = buildLegacyItem({ PK: 'SUBSCRIPTION#broken', authKey: undefined });
      const noKey = { Type: 'Subscription' };

      const result = mapper.splitReadable([buildLegacyItem(), broken, noKey]);

      expect(result.records).toEqual([buildRecord()]);
      expect(result.unreadable).toHaveLength(2);
      expect(result.unreadable[0].pk).toBe('SUBSCRIPTION#broken');
      expect(result.unreadable[0].reason).toContain('AuthKey');
      expect(result.unreadable[1].pk).toBeUndefined();
    });
  });
});
