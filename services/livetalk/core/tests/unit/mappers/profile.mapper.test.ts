import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { ProfileMapper } from '../../../src/mappers/profile.mapper.js';
import type { ProfileEntity, UserConsents } from '../../../src/entities/profile.entity.js';

const TIMESTAMP = 1_700_000_000_000;

const consents: UserConsents = {
  termsAgreed: { version: '1.0.0', agreedAt: TIMESTAMP + 1 },
  privacyAgreed: { version: '1.1.0', agreedAt: TIMESTAMP + 2 },
  ageVerified: { value: true, verifiedAt: TIMESTAMP + 3 },
};

/** 保存の形 (属性名は PascalCase) */
const storedConsents = {
  TermsAgreed: { Version: '1.0.0', AgreedAt: TIMESTAMP + 1 },
  PrivacyAgreed: { Version: '1.1.0', AgreedAt: TIMESTAMP + 2 },
  AgeVerified: { Value: true, VerifiedAt: TIMESTAMP + 3 },
};

function buildEntity(overrides: Partial<ProfileEntity> = {}): ProfileEntity {
  return {
    userId: 'google-12345',
    lastActiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#google-12345',
    SK: 'PROFILE',
    Type: 'Profile',
    UserID: 'google-12345',
    LastActiveAt: TIMESTAMP,
    CreatedAt: TIMESTAMP,
    UpdatedAt: TIMESTAMP,
    GSI1PK: 'PROFILE',
    GSI1SK: 'google-12345',
    ...overrides,
  };
}

describe('ProfileMapper', () => {
  const mapper = new ProfileMapper();

  it('entityType は Profile になる', () => {
    expect(mapper.entityType).toBe('Profile');
  });

  describe('buildKeys / getKey', () => {
    it('PK=USER#<userId> / SK=PROFILE を PK 先頭の順で返す', () => {
      const keys = mapper.buildKeys({ userId: 'google-12345' });

      expect(keys).toEqual({ PK: 'USER#google-12345', SK: 'PROFILE' });
      expect(Object.keys(keys)).toEqual(['PK', 'SK']);
    });

    it('Entity からビジネスキーを取り出す', () => {
      expect(mapper.getKey(buildEntity())).toEqual({ userId: 'google-12345' });
    });
  });

  describe('toItem', () => {
    it('保存形式 (PascalCase・キー・Type・GSI1) の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual(buildItem());
    });

    it('consents がない場合は Consents 属性を含めない', () => {
      expect(mapper.toItem(buildEntity())).not.toHaveProperty('Consents');
    });

    it('consents は保存の形 (ネストも PascalCase) に変換する', () => {
      expect(mapper.toItem(buildEntity({ consents })).Consents).toEqual(storedConsents);
    });

    it('一部の同意だけを持つ consents は、ある項目だけを書く', () => {
      const item = mapper.toItem(buildEntity({ consents: { termsAgreed: consents.termsAgreed } }));

      expect(item.Consents).toEqual({ TermsAgreed: storedConsents.TermsAgreed });
    });

    it('Auth 側の情報 (DisplayName / Email / GoogleID) は永続化しない', () => {
      const item = mapper.toItem(buildEntity());

      expect(item.DisplayName).toBeUndefined();
      expect(item.Email).toBeUndefined();
      expect(item.GoogleID).toBeUndefined();
    });
  });

  describe('toUpdateAttributes', () => {
    const key = { userId: 'google-12345' };

    it('指定した項目だけを保存用の属性名に変換し、GSI1 を key から付け直す', () => {
      const attributes = mapper.toUpdateAttributes({ lastActiveAt: TIMESTAMP + 10 }, key);

      expect(attributes).toEqual({
        LastActiveAt: TIMESTAMP + 10,
        GSI1PK: 'PROFILE',
        GSI1SK: 'google-12345',
        Consents: undefined,
        UserID: undefined,
        CreatedAt: undefined,
      });
    });

    it('consents は保存の形に変換する', () => {
      expect(mapper.toUpdateAttributes({ consents }, key).Consents).toEqual(storedConsents);
    });

    it('consents を null にすると属性の削除になる', () => {
      expect(mapper.toUpdateAttributes({ consents: null }, key).Consents).toBe(REMOVE_ATTRIBUTE);
    });

    it('必須項目 lastActiveAt を null にすると InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toUpdateAttributes({ lastActiveAt: null }, key)).toThrow(
        InvalidEntityDataError
      );
    });

    it.each([
      ['userId', { userId: 'google-12345' }],
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

    it('PK/SK/Type/GSI1 などの保存用の属性を Entity に含めない', () => {
      const entity = mapper.toEntity(buildItem());

      for (const name of ['PK', 'SK', 'Type', 'GSI1PK', 'GSI1SK']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it('保存の形の Consents を camelCase の consents に変換する', () => {
      expect(mapper.toEntity(buildItem({ Consents: storedConsents })).consents).toEqual(consents);
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

    it.each(['UserID', 'LastActiveAt', 'CreatedAt', 'UpdatedAt'])(
      '必須フィールド %s が欠けている場合は InvalidEntityDataError をスローする',
      (field) => {
        const item = buildItem();
        delete item[field];

        expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['オブジェクトでない Consents', 'invalid'],
      ['配列の Consents', []],
      ['オブジェクトでない同意記録', { TermsAgreed: 'x' }],
      ['Version が欠けた同意記録', { TermsAgreed: { AgreedAt: TIMESTAMP } }],
      [
        'Value が真偽値でない AgeVerified',
        { AgeVerified: { Value: 'yes', VerifiedAt: TIMESTAMP } },
      ],
      ['オブジェクトでない AgeVerified', { AgeVerified: null }],
    ])('%s は InvalidEntityDataError をスローする', (_name, stored) => {
      expect(() => mapper.toEntity(buildItem({ Consents: stored }))).toThrow(
        InvalidEntityDataError
      );
    });
  });

  describe('変換の往復', () => {
    it('Entity -> Item -> Entity の変換で元に戻る (consents あり・なし)', () => {
      for (const original of [buildEntity(), buildEntity({ consents })]) {
        expect(mapper.toEntity(mapper.toItem(original))).toEqual(original);
      }
    });
  });
});
