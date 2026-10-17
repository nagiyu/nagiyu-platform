import { InvalidEntityDataError } from '@nagiyu/aws';
import { PushSubscriptionMapper } from '../../../src/mappers/push-subscription.mapper.js';
import type { PushSubscriptionEntity } from '../../../src/entities/push-subscription.entity.js';

const TIMESTAMP = 1_700_000_000_000;

function buildEntity(overrides: Partial<PushSubscriptionEntity> = {}): PushSubscriptionEntity {
  return {
    userId: 'u1',
    subscriptionId: 'sub_abc123',
    endpoint: 'https://push.example.com/sub1',
    p256dhKey: 'p256-key',
    authKey: 'auth-key',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: 'PUSH_SUBSCRIPTION#sub_abc123',
    Type: 'PushSubscription',
    UserID: 'u1',
    SubscriptionID: 'sub_abc123',
    Endpoint: 'https://push.example.com/sub1',
    P256dhKey: 'p256-key',
    AuthKey: 'auth-key',
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('PushSubscriptionMapper', () => {
  const mapper = new PushSubscriptionMapper();

  it('entityType は PushSubscription になる', () => {
    expect(mapper.entityType).toBe('PushSubscription');
  });

  it('buildKeys は PK=USER#<userId> / SK=PUSH_SUBSCRIPTION#<subscriptionId> を PK 先頭の順で返す', () => {
    const keys = mapper.buildKeys({ userId: 'u1', subscriptionId: 'sub_abc123' });

    expect(keys).toEqual({ PK: 'USER#u1', SK: 'PUSH_SUBSCRIPTION#sub_abc123' });
    expect(Object.keys(keys)).toEqual(['PK', 'SK']);
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildEntity())).toEqual({ userId: 'u1', subscriptionId: 'sub_abc123' });
  });

  it('toItem は保存形式 (PascalCase・キー・Type) の Item に変換する', () => {
    expect(mapper.toItem(buildEntity())).toEqual(buildItem());
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      expect(
        mapper.toUpdateAttributes({ endpoint: 'https://push.example.com/2', authKey: 'a2' })
      ).toEqual({ Endpoint: 'https://push.example.com/2', AuthKey: 'a2' });
    });

    it.each(['endpoint', 'p256dhKey', 'authKey'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['userId', { userId: 'u1' }],
      ['subscriptionId', { subscriptionId: 'sub_abc123' }],
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

    it.each([
      'UserID',
      'SubscriptionID',
      'Endpoint',
      'P256dhKey',
      'AuthKey',
      'CreatedAt',
      'UpdatedAt',
    ])('必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする', (field) => {
      const item = buildItem();
      delete item[field];

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });
  });

  it('Entity -> Item -> Entity の変換で元に戻る', () => {
    const original = buildEntity();

    expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
  });
});
