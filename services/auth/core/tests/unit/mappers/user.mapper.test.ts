/**
 * Auth Core - User Mapper Unit Tests
 */

import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import type { RoleGrant, User } from '@nagiyu/common';
import { UserMapper } from '../../../src/mappers/user.mapper';

const CREATED_AT = 1704067200000;
const UPDATED_AT = 1706745600000;
const LOGIN_AT = 1709251200000;

function buildEntity(overrides: Partial<User> = {}): User {
  return {
    userId: 'user-123',
    googleId: 'google-123',
    email: 'user@example.com',
    name: 'テストユーザー',
    roles: ['admin'],
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: 'user-123',
    googleId: 'google-123',
    Type: 'User',
    Email: 'user@example.com',
    Name: 'テストユーザー',
    Roles: ['admin'],
    CreatedAt: CREATED_AT,
    UpdatedAt: UPDATED_AT,
    ...overrides,
  };
}

const GRANT: RoleGrant = {
  grantId: 'grant-1',
  roleId: 'stock-user',
  source: 'manual',
  sourceRef: 'メモ',
  expiresAt: UPDATED_AT + 1000,
  revokedAt: UPDATED_AT + 500,
  grantedBy: 'admin-1',
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

describe('UserMapper', () => {
  let mapper: UserMapper;

  beforeEach(() => {
    mapper = new UserMapper();
  });

  it('entityType は User になる', () => {
    expect(mapper.entityType).toBe('User');
  });

  describe('buildKeys / getKey', () => {
    it('userId だけの単一キーを構築する', () => {
      expect(mapper.buildKeys({ userId: 'user-123' })).toEqual({ userId: 'user-123' });
    });

    it('Entity からビジネスキーを取り出す', () => {
      expect(mapper.getKey(buildEntity({ userId: 'user-456' }))).toEqual({ userId: 'user-456' });
    });
  });

  describe('toItem', () => {
    it('キー属性と GSI キーは据え置き、それ以外は PascalCase で Type を付けて保存する', () => {
      expect(mapper.toItem(buildEntity())).toEqual(buildItem());
    });

    it('picture と lastLoginAt があれば保存する', () => {
      expect(
        mapper.toItem(buildEntity({ picture: 'https://example.com/a.png', lastLoginAt: LOGIN_AT }))
      ).toEqual(buildItem({ Picture: 'https://example.com/a.png', LastLoginAt: LOGIN_AT }));
    });

    it('picture と lastLoginAt がなければ属性を作らない', () => {
      const item = mapper.toItem(buildEntity());

      expect(item).not.toHaveProperty('Picture');
      expect(item).not.toHaveProperty('LastLoginAt');
    });

    it('キー属性が buildKeys の結果と一致する', () => {
      const entity = buildEntity({ userId: 'user-789' });
      const item = mapper.toItem(entity);

      for (const [name, value] of Object.entries(mapper.buildKeys(mapper.getKey(entity)))) {
        expect(item[name]).toBe(value);
      }
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      const attributes = mapper.toUpdateAttributes({
        name: '新しい名前',
        roles: ['user-manager'],
        email: 'new@example.com',
        lastLoginAt: LOGIN_AT,
        picture: 'https://example.com/b.png',
      });

      expect(attributes).toEqual({
        Name: '新しい名前',
        Roles: ['user-manager'],
        Email: 'new@example.com',
        LastLoginAt: LOGIN_AT,
        Picture: 'https://example.com/b.png',
      });
    });

    it('undefined の項目は変更しない', () => {
      const attributes = mapper.toUpdateAttributes({ name: '新しい名前' });

      expect(attributes.Name).toBe('新しい名前');
      expect(attributes.Roles).toBeUndefined();
      expect(attributes.Picture).toBeUndefined();
    });

    it('任意項目の null は属性の削除になる', () => {
      const attributes = mapper.toUpdateAttributes({ picture: null, lastLoginAt: null });

      expect(attributes.Picture).toBe(REMOVE_ATTRIBUTE);
      expect(attributes.LastLoginAt).toBe(REMOVE_ATTRIBUTE);
    });

    it.each([['email'], ['name'], ['roles']] as const)(
      '必須項目 %s に null を渡すと InvalidEntityDataError になる',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['userId', 'user-999'],
      ['googleId', 'google-999'],
      ['createdAt', CREATED_AT],
    ] as const)('変更不可の項目 %s を含めると InvalidEntityDataError になる', (field, value) => {
      expect(() => mapper.toUpdateAttributes({ [field]: value })).toThrow(InvalidEntityDataError);
    });

    it('変更不可の項目は同じ値でも拒否する', () => {
      expect(() => mapper.toUpdateAttributes({ googleId: 'google-123' })).toThrow(
        InvalidEntityDataError
      );
    });
  });

  describe('toEntity', () => {
    it('新形式の Item を Entity に変換する', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('picture と lastLoginAt を読む', () => {
      expect(
        mapper.toEntity(buildItem({ Picture: 'https://example.com/a.png', LastLoginAt: LOGIN_AT }))
      ).toEqual(buildEntity({ picture: 'https://example.com/a.png', lastLoginAt: LOGIN_AT }));
    });

    it('旧属性名と ISO 文字列の時刻の Item を読める', () => {
      const item = {
        userId: 'user-123',
        googleId: 'google-123',
        email: 'old@example.com',
        name: '旧ユーザー',
        picture: 'https://example.com/old.png',
        roles: ['admin'],
        createdAt: new Date(CREATED_AT).toISOString(),
        updatedAt: new Date(UPDATED_AT).toISOString(),
        lastLoginAt: new Date(LOGIN_AT).toISOString(),
      };

      expect(mapper.toEntity(item)).toEqual({
        userId: 'user-123',
        googleId: 'google-123',
        email: 'old@example.com',
        name: '旧ユーザー',
        picture: 'https://example.com/old.png',
        roles: ['admin'],
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        lastLoginAt: LOGIN_AT,
      });
    });

    it('新旧が併存するときは新名を優先する', () => {
      const entity = mapper.toEntity(
        buildItem({
          email: 'old@example.com',
          name: '旧名',
          roles: [],
          picture: 'https://example.com/old.png',
          createdAt: '2000-01-01T00:00:00.000Z',
          updatedAt: '2000-01-01T00:00:00.000Z',
          Picture: 'https://example.com/new.png',
        })
      );

      expect(entity).toEqual(buildEntity({ picture: 'https://example.com/new.png' }));
    });

    it('roles が空配列でも読める', () => {
      expect(mapper.toEntity(buildItem({ Roles: [] })).roles).toEqual([]);
    });

    it.each([
      ['userId', { userId: undefined }],
      ['googleId', { googleId: 42 }],
      ['Email', { Email: undefined }],
      ['Name', { Name: '' }],
      ['Roles が配列でない', { Roles: 'admin' }],
      ['Roles に文字列以外が混ざる', { Roles: ['admin', 1] }],
      ['Roles がない', { Roles: undefined }],
      ['CreatedAt がない', { CreatedAt: undefined }],
      ['UpdatedAt が不正な文字列', { UpdatedAt: 'not-a-date' }],
      ['Picture が文字列でない', { Picture: 123 }],
      ['LastLoginAt が不正な文字列', { LastLoginAt: 'not-a-date' }],
    ])('%s のとき InvalidEntityDataError になる', (_label, overrides) => {
      expect(() => mapper.toEntity(buildItem(overrides))).toThrow(InvalidEntityDataError);
    });
  });

  describe('RoleGrants', () => {
    it('属性がない Item は roleGrants なしで読める', () => {
      const entity = mapper.toEntity(buildItem());
      expect(entity.roleGrants).toBeUndefined();
    });

    it('roleGrants がなければ RoleGrants 属性を作らない', () => {
      expect(mapper.toItem(buildEntity())).not.toHaveProperty('RoleGrants');
    });

    it('roleGrants を map のリストとして保存し、読み戻せる', () => {
      const item = mapper.toItem(buildEntity({ roleGrants: [GRANT] }));
      expect(item.RoleGrants).toEqual([GRANT]);
      expect(mapper.toEntity({ ...buildItem(), RoleGrants: item.RoleGrants }).roleGrants).toEqual([
        GRANT,
      ]);
    });

    it('任意項目のない権利は属性を作らない', () => {
      const minimal: RoleGrant = {
        grantId: 'g2',
        roleId: 'admin',
        source: 'stripe',
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      };
      const item = mapper.toItem(buildEntity({ roleGrants: [minimal] }));
      expect(item.RoleGrants).toEqual([minimal]);
      expect(Object.keys((item.RoleGrants as object[])[0])).not.toContain('expiresAt');
      expect(mapper.toEntity({ ...buildItem(), RoleGrants: item.RoleGrants }).roleGrants).toEqual([
        minimal,
      ]);
    });

    it('空のリストは空として読める', () => {
      expect(mapper.toEntity(buildItem({ RoleGrants: [] })).roleGrants).toEqual([]);
    });

    it('更新では roleGrants を RoleGrants として渡し、null は属性の削除になる', () => {
      expect(mapper.toUpdateAttributes({ roleGrants: [GRANT] }).RoleGrants).toEqual([GRANT]);
      expect(mapper.toUpdateAttributes({ roleGrants: null }).RoleGrants).toBe(REMOVE_ATTRIBUTE);
      expect(mapper.toUpdateAttributes({ name: 'x' }).RoleGrants).toBeUndefined();
    });

    it.each([
      ['配列でない', { RoleGrants: 'x' }],
      ['要素がオブジェクトでない', { RoleGrants: ['x'] }],
      ['grantId がない', { RoleGrants: [{ ...GRANT, grantId: undefined }] }],
      ['roleId がない', { RoleGrants: [{ ...GRANT, roleId: undefined }] }],
      ['source が未知', { RoleGrants: [{ ...GRANT, source: 'other' }] }],
      ['createdAt がない', { RoleGrants: [{ ...GRANT, createdAt: undefined }] }],
      ['updatedAt が不正', { RoleGrants: [{ ...GRANT, updatedAt: 'x' }] }],
      ['sourceRef が文字列でない', { RoleGrants: [{ ...GRANT, sourceRef: 1 }] }],
      ['expiresAt が不正', { RoleGrants: [{ ...GRANT, expiresAt: 'x' }] }],
      ['revokedAt が不正', { RoleGrants: [{ ...GRANT, revokedAt: 'x' }] }],
      ['grantedBy が空', { RoleGrants: [{ ...GRANT, grantedBy: '' }] }],
    ])('%s のとき InvalidEntityDataError になる', (_label, overrides) => {
      expect(() => mapper.toEntity(buildItem(overrides))).toThrow(InvalidEntityDataError);
    });
  });

  describe('StripeCustomerId', () => {
    it('保存して読み戻せる', () => {
      const item = mapper.toItem(buildEntity({ stripeCustomerId: 'cus_1' }));

      expect(item.StripeCustomerId).toBe('cus_1');
      expect(mapper.toEntity(item).stripeCustomerId).toBe('cus_1');
    });

    it('属性が無い項目も読め、保存時も属性を作らない', () => {
      expect(mapper.toEntity(buildItem())).not.toHaveProperty('stripeCustomerId');
      expect(mapper.toItem(buildEntity())).not.toHaveProperty('StripeCustomerId');
    });

    it('文字列でなければ読み込みを拒否する', () => {
      expect(() => mapper.toEntity(buildItem({ StripeCustomerId: 1 }))).toThrow(
        InvalidEntityDataError
      );
    });

    it('更新の属性に変換でき、null で削除する', () => {
      expect(mapper.toUpdateAttributes({ stripeCustomerId: 'cus_1' }).StripeCustomerId).toBe(
        'cus_1'
      );
      expect(mapper.toUpdateAttributes({ stripeCustomerId: null }).StripeCustomerId).toBe(
        REMOVE_ATTRIBUTE
      );
      expect(mapper.toUpdateAttributes({ name: 'x' }).StripeCustomerId).toBeUndefined();
    });
  });

  describe('legacyAttributeNames', () => {
    it('更新で書き得る保存属性の旧名を宣言している', () => {
      expect(mapper.legacyAttributeNames).toEqual({
        Email: ['email'],
        Name: ['name'],
        Picture: ['picture'],
        Roles: ['roles'],
        CreatedAt: ['createdAt'],
        UpdatedAt: ['updatedAt'],
        LastLoginAt: ['lastLoginAt'],
      });
    });
  });
});
