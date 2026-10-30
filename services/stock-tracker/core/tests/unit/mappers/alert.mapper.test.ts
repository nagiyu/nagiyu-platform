/**
 * Stock Tracker Core - Alert Mapper Unit Tests
 *
 * AlertMapperのユニットテスト
 */

import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import {
  AlertMapper,
  buildAlertGsi1Pk,
  buildAlertGsi1Sk,
  buildAlertGsi2Pk,
  buildAlertGsi2Sk,
} from '../../../src/mappers/alert.mapper.js';
import type { AlertEntity } from '../../../src/entities/alert.entity.js';

const TIMESTAMP = 1704067200000;
const KEY = { userId: 'user-123', alertId: 'alert-123' };

const SUBSCRIPTION = {
  endpoint: 'https://example.com/push',
  keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
};

function buildEntity(overrides: Partial<AlertEntity> = {}): AlertEntity {
  return {
    alertId: 'alert-123',
    userId: 'user-123',
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    mode: 'Buy',
    frequency: 'MINUTE_LEVEL',
    enabled: true,
    conditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
    subscription: SUBSCRIPTION,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#user-123',
    SK: 'ALERT#alert-123',
    Type: 'Alert',
    GSI1PK: 'user-123',
    GSI1SK: 'Alert#alert-123',
    GSI2PK: 'ALERT#MINUTE_LEVEL',
    GSI2SK: 'user-123#alert-123',
    AlertID: 'alert-123',
    UserID: 'user-123',
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Mode: 'Buy',
    Frequency: 'MINUTE_LEVEL',
    Enabled: true,
    ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
    Subscription: SUBSCRIPTION,
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('AlertMapper', () => {
  let mapper: AlertMapper;

  beforeEach(() => {
    mapper = new AlertMapper();
  });

  it('entityType は Alert になる', () => {
    expect(mapper.entityType).toBe('Alert');
  });

  it('旧属性名 subscription を新属性名 Subscription の旧名として宣言する', () => {
    expect(mapper.legacyAttributeNames).toEqual({ Subscription: ['subscription'] });
  });

  describe('buildKeys', () => {
    it('ビジネスキーから PK/SK を構築する', () => {
      expect(mapper.buildKeys(KEY)).toEqual({ PK: 'USER#user-123', SK: 'ALERT#alert-123' });
    });

    it('PK が先頭のキー属性になる (条件付き書き込みの存在判定に使われる)', () => {
      expect(Object.keys(mapper.buildKeys(KEY))).toEqual(['PK', 'SK']);
    });

    it('異なるユーザーIDで異なる PK を生成する', () => {
      const keys1 = mapper.buildKeys(KEY);
      const keys2 = mapper.buildKeys({ ...KEY, userId: 'user-456' });

      expect(keys1.PK).not.toBe(keys2.PK);
      expect(keys1.SK).toBe(keys2.SK);
    });

    it('異なるアラートIDで異なる SK を生成する', () => {
      const keys1 = mapper.buildKeys(KEY);
      const keys2 = mapper.buildKeys({ ...KEY, alertId: 'alert-456' });

      expect(keys1.PK).toBe(keys2.PK);
      expect(keys1.SK).not.toBe(keys2.SK);
    });
  });

  describe('getKey', () => {
    it('Entity からビジネスキーを取り出す', () => {
      expect(mapper.getKey(buildEntity({ userId: 'user-456', alertId: 'alert-456' }))).toEqual({
        userId: 'user-456',
        alertId: 'alert-456',
      });
    });
  });

  describe('GSI のキー', () => {
    it('GSI1 は ユーザーID と Alert# を前置したアラートID になる', () => {
      expect(buildAlertGsi1Pk('user-123')).toBe('user-123');
      expect(buildAlertGsi1Sk('alert-123')).toBe('Alert#alert-123');
    });

    it('GSI2 は ALERT# を前置した頻度と、ユーザーID#アラートID になる', () => {
      expect(buildAlertGsi2Pk('HOURLY_LEVEL')).toBe('ALERT#HOURLY_LEVEL');
      expect(buildAlertGsi2Sk('user-123', 'alert-123')).toBe('user-123#alert-123');
    });
  });

  describe('toItem', () => {
    it('Entity を保存形式 (PascalCase・キー・Type・GSI1/GSI2) の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual(buildItem());
    });

    it('サブスクリプションを新属性名 Subscription で保存し、旧属性名 subscription は書かない', () => {
      const item = mapper.toItem(buildEntity());

      expect(item.Subscription).toEqual(SUBSCRIPTION);
      expect(item).not.toHaveProperty('subscription');
    });

    it('toItem のキー属性は buildKeys の結果と一致する', () => {
      const entity = buildEntity({ userId: 'user-456', alertId: 'alert-456' });
      const item = mapper.toItem(entity);

      for (const [name, value] of Object.entries(mapper.buildKeys(mapper.getKey(entity)))) {
        expect(item[name]).toBe(value);
      }
    });

    it('異なる頻度で異なる GSI2PK を生成する', () => {
      expect(mapper.toItem(buildEntity({ frequency: 'MINUTE_LEVEL' })).GSI2PK).toBe(
        'ALERT#MINUTE_LEVEL'
      );
      expect(mapper.toItem(buildEntity({ frequency: 'HOURLY_LEVEL' })).GSI2PK).toBe(
        'ALERT#HOURLY_LEVEL'
      );
    });

    it.each(['AND', 'OR'] as const)('logicalOperator が %s の場合、Item に含まれる', (op) => {
      expect(mapper.toItem(buildEntity({ logicalOperator: op })).LogicalOperator).toBe(op);
    });

    it('任意項目が未指定の場合、Item に含まれない', () => {
      const item = mapper.toItem(buildEntity());

      for (const name of ['LogicalOperator', 'CustomMessage', 'Temporary', 'TemporaryExpireDate']) {
        expect(item).not.toHaveProperty(name);
      }
      expect(item).not.toHaveProperty('TTL');
    });

    it('temporary が true の場合、Temporary と TemporaryExpireDate を Item に含める', () => {
      const item = mapper.toItem(
        buildEntity({ temporary: true, temporaryExpireDate: '2024-01-02' })
      );

      expect(item.Temporary).toBe(true);
      expect(item.TemporaryExpireDate).toBe('2024-01-02');
    });

    it('temporary が false の場合、TemporaryExpireDate があっても Item に含めない', () => {
      const item = mapper.toItem(
        buildEntity({ temporary: false, temporaryExpireDate: '2024-01-02' })
      );

      expect(item).not.toHaveProperty('Temporary');
      expect(item).not.toHaveProperty('TemporaryExpireDate');
    });

    it('customMessage が指定されている場合、Item に含まれる', () => {
      expect(mapper.toItem(buildEntity({ customMessage: 'メモ' })).CustomMessage).toBe('メモ');
    });

    it('customMessage が空文字列の場合、Item に含まれない', () => {
      expect(mapper.toItem(buildEntity({ customMessage: '' }))).not.toHaveProperty('CustomMessage');
    });

    it('expiresAt (ミリ秒) を TTL 属性にエポック秒で保存する', () => {
      const item = mapper.toItem(buildEntity({ expiresAt: 1704067200999 }));

      expect(item.TTL).toBe(1704067200);
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      const attributes = mapper.toUpdateAttributes(
        {
          mode: 'Sell',
          enabled: false,
          conditionList: [{ field: 'price', operator: 'gte', value: 1 }],
        },
        KEY
      );

      expect(attributes).toMatchObject({
        Mode: 'Sell',
        Enabled: false,
        ConditionList: [{ field: 'price', operator: 'gte', value: 1 }],
      });
      expect(attributes.Frequency).toBeUndefined();
      expect(attributes.Subscription).toBeUndefined();
    });

    it('サブスクリプションは新属性名 Subscription で書く', () => {
      const attributes = mapper.toUpdateAttributes({ subscription: SUBSCRIPTION }, KEY);

      expect(attributes.Subscription).toEqual(SUBSCRIPTION);
      expect(attributes).not.toHaveProperty('subscription');
    });

    it('GSI1 と GSI2SK は key から付け直す', () => {
      expect(mapper.toUpdateAttributes({}, KEY)).toMatchObject({
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-123',
        GSI2SK: 'user-123#alert-123',
      });
    });

    it('frequency を変えるときだけ GSI2PK を付け直す', () => {
      expect(mapper.toUpdateAttributes({ frequency: 'HOURLY_LEVEL' }, KEY)).toMatchObject({
        Frequency: 'HOURLY_LEVEL',
        GSI2PK: 'ALERT#HOURLY_LEVEL',
      });
      expect(mapper.toUpdateAttributes({ enabled: false }, KEY).GSI2PK).toBeUndefined();
    });

    it('logicalOperator を属性に変換する', () => {
      expect(mapper.toUpdateAttributes({ logicalOperator: 'OR' }, KEY).LogicalOperator).toBe('OR');
    });

    it('expiresAt (ミリ秒) を TTL 属性にエポック秒で変換する', () => {
      expect(mapper.toUpdateAttributes({ expiresAt: 1704067200999 }, KEY).TTL).toBe(1704067200);
    });

    it.each([
      ['temporary', 'Temporary'],
      ['temporaryExpireDate', 'TemporaryExpireDate'],
      ['logicalOperator', 'LogicalOperator'],
      ['customMessage', 'CustomMessage'],
      ['expiresAt', 'TTL'],
    ] as const)('任意項目 %s を null にすると属性 %s を削除する', (field, attribute) => {
      const attributes = mapper.toUpdateAttributes({ [field]: null }, KEY);

      expect(attributes[attribute]).toBe(REMOVE_ATTRIBUTE);
    });

    it('undefined の項目は変更しない', () => {
      const attributes = mapper.toUpdateAttributes(
        { customMessage: undefined, expiresAt: undefined },
        KEY
      );

      expect(attributes.CustomMessage).toBeUndefined();
      expect(attributes.TTL).toBeUndefined();
    });

    it.each(['mode', 'frequency', 'enabled', 'conditionList', 'subscription'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null }, KEY)).toThrow(
          InvalidEntityDataError
        );
      }
    );

    it.each([
      ['alertId', { alertId: 'alert-123' }],
      ['userId', { userId: 'user-123' }],
      ['tickerId', { tickerId: 'NSDQ:AAPL' }],
      ['exchangeId', { exchangeId: 'NASDAQ' }],
      ['createdAt', { createdAt: TIMESTAMP }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes, KEY)).toThrow(InvalidEntityDataError);
      }
    );

    it('変更不可の項目を null にしても InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toUpdateAttributes({ exchangeId: null }, KEY)).toThrow(
        InvalidEntityDataError
      );
    });
  });

  describe('toEntity', () => {
    it('Item を camelCase の Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('PK/SK/Type などの保存用の属性を Entity に含めない', () => {
      const entity = mapper.toEntity(buildItem());

      for (const name of ['PK', 'SK', 'Type', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK', 'TTL']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it.each([
      'AlertID',
      'UserID',
      'TickerID',
      'ExchangeID',
      'Mode',
      'Frequency',
      'Enabled',
      'ConditionList',
    ])('必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする', (field) => {
      const item = buildItem();
      delete item[field];

      expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
    });

    it('conditionList が空配列の場合は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ ConditionList: [] }))).toThrow(
        InvalidEntityDataError
      );
    });

    it.each([
      ['配列でない', 'price'],
      ['オブジェクト', { field: 'price' }],
      ['null', null],
    ])('ConditionList が%sの場合は InvalidEntityDataError をスローする', (_label, value) => {
      expect(() => mapper.toEntity(buildItem({ ConditionList: value }))).toThrow(
        InvalidEntityDataError
      );
    });

    it('Mode と Frequency が不正な値の場合は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ Mode: 'Hold' }))).toThrow(InvalidEntityDataError);
      expect(() => mapper.toEntity(buildItem({ Frequency: 'DAILY_LEVEL' }))).toThrow(
        InvalidEntityDataError
      );
    });

    it.each(['AND', 'OR'] as const)('LogicalOperator が %s の場合、Entity に含まれる', (op) => {
      expect(mapper.toEntity(buildItem({ LogicalOperator: op })).logicalOperator).toBe(op);
    });

    it('LogicalOperator が未指定または不正な値の場合、Entity に含まれない', () => {
      expect(mapper.toEntity(buildItem())).not.toHaveProperty('logicalOperator');
      expect(mapper.toEntity(buildItem({ LogicalOperator: 'XOR' }))).not.toHaveProperty(
        'logicalOperator'
      );
    });

    it('Temporary=true と TemporaryExpireDate が復元される', () => {
      const entity = mapper.toEntity(
        buildItem({ Temporary: true, TemporaryExpireDate: '2024-01-02' })
      );

      expect(entity.temporary).toBe(true);
      expect(entity.temporaryExpireDate).toBe('2024-01-02');
    });

    it('Temporary が未設定の場合、Entity に temporary は含まれない', () => {
      expect(mapper.toEntity(buildItem())).not.toHaveProperty('temporary');
    });

    it('CustomMessage がある場合は復元され、空文字列の場合は含まれない', () => {
      expect(mapper.toEntity(buildItem({ CustomMessage: 'メモ' })).customMessage).toBe('メモ');
      expect(mapper.toEntity(buildItem({ CustomMessage: '' }))).not.toHaveProperty('customMessage');
    });

    it('TTL (エポック秒) を expiresAt (ミリ秒) に戻す', () => {
      expect(mapper.toEntity(buildItem({ TTL: 1704067200 })).expiresAt).toBe(1704067200000);
    });

    it('TTL がない場合、Entity に expiresAt は含まれない', () => {
      expect(mapper.toEntity(buildItem())).not.toHaveProperty('expiresAt');
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

    it('時刻がエポック秒で保存された旧形式のデータもミリ秒で読める', () => {
      const entity = mapper.toEntity(
        buildItem({ CreatedAt: TIMESTAMP / 1000, UpdatedAt: TIMESTAMP / 1000 })
      );

      expect(entity.createdAt).toBe(TIMESTAMP);
      expect(entity.updatedAt).toBe(TIMESTAMP);
    });

    describe('サブスクリプション', () => {
      it('旧属性名 subscription で保存されたデータも読める', () => {
        const item = buildItem();
        delete item.Subscription;
        item.subscription = SUBSCRIPTION;

        expect(mapper.toEntity(item).subscription).toEqual(SUBSCRIPTION);
      });

      it('新旧の属性名が両方ある場合は新属性名 Subscription を優先する', () => {
        const newer = { endpoint: 'https://example.com/new', keys: { p256dh: 'n', auth: 'n' } };
        const entity = mapper.toEntity(
          buildItem({
            Subscription: newer,
            subscription: SUBSCRIPTION,
          })
        );

        expect(entity.subscription).toEqual(newer);
      });

      it('入れ子になる前の平坦な形式 (SubscriptionEndpoint など) も読める', () => {
        const item = buildItem();
        delete item.Subscription;
        item.SubscriptionEndpoint = 'https://example.com/flat';
        item.SubscriptionKeysP256dh = 'flat-p256dh';
        item.SubscriptionKeysAuth = 'flat-auth';

        expect(mapper.toEntity(item).subscription).toEqual({
          endpoint: 'https://example.com/flat',
          keys: { p256dh: 'flat-p256dh', auth: 'flat-auth' },
        });
      });

      it('どの形式のサブスクリプションもない場合は InvalidEntityDataError をスローする', () => {
        const item = buildItem();
        delete item.Subscription;

        expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      });

      it('keys がオブジェクトでない場合は InvalidEntityDataError をスローする', () => {
        expect(() =>
          mapper.toEntity(buildItem({ Subscription: { endpoint: 'https://x', keys: 'invalid' } }))
        ).toThrow(InvalidEntityDataError);
      });

      it('endpoint や鍵が文字列でない場合は InvalidEntityDataError をスローする', () => {
        expect(() =>
          mapper.toEntity(
            buildItem({ Subscription: { endpoint: 1, keys: { p256dh: 'a', auth: 'b' } } })
          )
        ).toThrow(InvalidEntityDataError);
        expect(() =>
          mapper.toEntity(
            buildItem({ Subscription: { endpoint: 'https://x', keys: { p256dh: 'a' } } })
          )
        ).toThrow(InvalidEntityDataError);
      });
    });
  });

  describe('変換の往復', () => {
    it('Entity -> Item -> Entity の変換で元に戻る', () => {
      const original = buildEntity();

      expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
    });

    it('すべての任意項目を持つ Entity も元に戻る', () => {
      const original = buildEntity({
        conditionList: [
          {
            field: 'price',
            operator: 'gte',
            value: 100,
            isPercentage: true,
            percentageValue: 5,
            basePrice: 95.24,
          },
          { field: 'price', operator: 'lte', value: 90 },
        ],
        logicalOperator: 'OR',
        customMessage: 'メモ',
        temporary: true,
        temporaryExpireDate: '2024-01-02',
        expiresAt: 1704067200000,
      });

      expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
    });

    it('customMessage が空文字列の Entity は往復後に未設定として扱われる', () => {
      const result = mapper.toEntity(mapper.toItem(buildEntity({ customMessage: '' })));

      expect(result).not.toHaveProperty('customMessage');
    });
  });

  describe('splitReadable', () => {
    it('読めたアラートと、読めなかったアイテム (識別情報と理由つき) に分ける', () => {
      const broken = buildItem({
        AlertID: 'alert-broken',
        SK: 'ALERT#alert-broken',
        Subscription: { ...SUBSCRIPTION, keys: { p256dh: '', auth: 'auth-secret' } },
      });

      const result = mapper.splitReadable([buildItem(), broken]);

      expect(result.alerts.map((alert) => alert.alertId)).toEqual(['alert-123']);
      expect(result.unreadable).toEqual([
        {
          userId: 'user-123',
          alertId: 'alert-broken',
          pk: 'USER#user-123',
          sk: 'ALERT#alert-broken',
          reason: expect.stringContaining('Subscription.keys.p256dh'),
        },
      ]);
    });

    it('userId / alertId が空や欠落のときは含めず、保存キーだけを返す', () => {
      const result = mapper.splitReadable([buildItem({ UserID: '', AlertID: undefined })]);

      expect(result.unreadable).toEqual([
        { pk: 'USER#user-123', sk: 'ALERT#alert-123', reason: expect.any(String) },
      ]);
    });

    it('PK / SK も無いアイテムは、理由だけを返す', () => {
      const result = mapper.splitReadable([{}]);

      expect(result.unreadable).toEqual([{ reason: expect.any(String) }]);
    });
  });

  describe('toTemporaryCandidate', () => {
    const candidateItem = {
      AlertID: 'alert-1',
      UserID: 'user-1',
      ExchangeID: 'NASDAQ',
      Frequency: 'MINUTE_LEVEL',
      Enabled: true,
      Temporary: true,
      TemporaryExpireDate: '2026-03-04',
    };

    it('失効判定に必要な属性のみを軽量エンティティに変換する', () => {
      expect(mapper.toTemporaryCandidate(candidateItem)).toEqual({
        alertId: 'alert-1',
        userId: 'user-1',
        exchangeId: 'NASDAQ',
        frequency: 'MINUTE_LEVEL',
        enabled: true,
        temporary: true,
        temporaryExpireDate: '2026-03-04',
      });
    });

    it('Subscription / ConditionList がなくても例外を投げない', () => {
      expect(() => mapper.toTemporaryCandidate(candidateItem)).not.toThrow();
    });

    it('Temporary !== true の場合、temporary は false で返る', () => {
      const candidate = mapper.toTemporaryCandidate({ ...candidateItem, Temporary: false });

      expect(candidate.temporary).toBe(false);
    });

    it('AlertID 欠損時に InvalidEntityDataError を投げる', () => {
      const item: Record<string, unknown> = { ...candidateItem };
      delete item.AlertID;

      expect(() => mapper.toTemporaryCandidate(item)).toThrow(InvalidEntityDataError);
      expect(() => mapper.toTemporaryCandidate(item)).toThrow(/AlertID/);
    });

    it('TemporaryExpireDate 欠損時に InvalidEntityDataError を投げる', () => {
      const item: Record<string, unknown> = { ...candidateItem };
      delete item.TemporaryExpireDate;

      expect(() => mapper.toTemporaryCandidate(item)).toThrow(/TemporaryExpireDate/);
    });
  });
});
