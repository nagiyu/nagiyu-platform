import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { UserMapper } from '../../../../src/repositories/user/user-mapper.js';
import type { User } from '../../../../src/types/index.js';

const CREATED_AT = 1704067200000;
const UPDATED_AT = 1704067300000;

function buildUser(overrides: Partial<User> = {}): User {
  return {
    userId: 'user-123',
    email: 'user@example.com',
    name: 'テストユーザー',
    image: 'https://example.com/a.png',
    defaultListId: 'list-1',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#user-123',
    SK: '#META#',
    Type: 'User',
    GSI2PK: 'EMAIL#user@example.com',
    UserID: 'user-123',
    Email: 'user@example.com',
    Name: 'テストユーザー',
    Image: 'https://example.com/a.png',
    DefaultListID: 'list-1',
    CreatedAt: CREATED_AT,
    UpdatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildLegacyItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#user-123',
    SK: '#META#',
    GSI2PK: 'EMAIL#user@example.com',
    userId: 'user-123',
    email: 'user@example.com',
    name: 'テストユーザー',
    image: 'https://example.com/a.png',
    defaultListId: 'list-1',
    createdAt: new Date(CREATED_AT).toISOString(),
    updatedAt: new Date(UPDATED_AT).toISOString(),
    ...overrides,
  };
}

describe('UserMapper', () => {
  const mapper = new UserMapper();

  it('entityType は User になる', () => {
    expect(mapper.entityType).toBe('User');
  });

  it('buildKeys は PK を先頭にした PK/SK を返す', () => {
    const keys = mapper.buildKeys({ userId: 'user-123' });
    expect(keys).toEqual({ PK: 'USER#user-123', SK: '#META#' });
    expect(Object.keys(keys)[0]).toBe('PK');
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildUser())).toEqual({ userId: 'user-123' });
  });

  describe('toItem', () => {
    it('保存形式 (PascalCase・数値ミリ秒・Type・GSI2PK) の Item に変換する', () => {
      expect(mapper.toItem(buildUser())).toEqual(buildItem());
    });

    it('image がないときは Image 属性を含めない', () => {
      expect(mapper.toItem(buildUser({ image: undefined }))).not.toHaveProperty('Image');
    });
  });

  describe('toEntity', () => {
    it('新形式の Item を Entity に変換する (往復で一致する)', () => {
      expect(mapper.toEntity(mapper.toItem(buildUser()))).toEqual(buildUser());
    });

    it('PK/SK/Type/GSI2PK を Entity に含めない', () => {
      const entity = mapper.toEntity(buildItem());
      for (const name of ['PK', 'SK', 'Type', 'GSI2PK']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it('image がない Item は image を undefined にする', () => {
      expect(mapper.toEntity(buildItem({ Image: undefined })).image).toBeUndefined();
    });

    it('旧形式 (camelCase の属性名と ISO 文字列の時刻) を読める', () => {
      expect(mapper.toEntity(buildLegacyItem())).toEqual(buildUser());
    });

    it('新名が旧名より優先される', () => {
      expect(mapper.toEntity(buildItem({ name: '旧名' })).name).toBe('テストユーザー');
    });

    it('空の name と image は許容する', () => {
      const entity = mapper.toEntity(buildItem({ Name: '', Image: '' }));
      expect(entity.name).toBe('');
      expect(entity.image).toBe('');
    });

    it.each(['UserID', 'Email', 'Name', 'DefaultListID', 'CreatedAt', 'UpdatedAt'])(
      '必須の %s がない Item は InvalidEntityDataError をスローする',
      (attribute) => {
        expect(() => mapper.toEntity(buildItem({ [attribute]: undefined }))).toThrow(
          InvalidEntityDataError
        );
      }
    );

    it('image が文字列でない Item は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ Image: 123 }))).toThrow(InvalidEntityDataError);
    });

    it('時刻が不正な Item は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ CreatedAt: 'invalid' }))).toThrow(
        InvalidEntityDataError
      );
    });
  });

  describe('toUpdateAttributes', () => {
    it('指定した項目だけを保存用の属性名に変換する', () => {
      const attributes = mapper.toUpdateAttributes({ name: '新しい名前', defaultListId: 'list-2' });
      expect(attributes.Name).toBe('新しい名前');
      expect(attributes.DefaultListID).toBe('list-2');
      expect(attributes.Email).toBeUndefined();
    });

    it('キー属性 (PK/SK) を返さない', () => {
      const attributes = mapper.toUpdateAttributes({ email: 'new@example.com' });
      expect(attributes).not.toHaveProperty('PK');
      expect(attributes).not.toHaveProperty('SK');
    });

    it('email を変えるときは GSI2PK を新しい email から付け直す', () => {
      const attributes = mapper.toUpdateAttributes({ email: 'new@example.com' });
      expect(attributes.Email).toBe('new@example.com');
      expect(attributes.GSI2PK).toBe('EMAIL#new@example.com');
    });

    it('email を変えないときは GSI2PK を含めない', () => {
      expect(mapper.toUpdateAttributes({ name: '新しい名前' }).GSI2PK).toBeUndefined();
    });

    it('image が null のときは属性の削除にする', () => {
      const attributes = mapper.toUpdateAttributes({ image: null });
      expect(attributes.Image).toBe(REMOVE_ATTRIBUTE);
    });

    it.each(['email', 'name', 'defaultListId'] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (field) => {
        expect(() => mapper.toUpdateAttributes({ [field]: null })).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['userId', { userId: 'user-123' }],
      ['createdAt', { createdAt: CREATED_AT }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes)).toThrow(InvalidEntityDataError);
      }
    );
  });

  it('legacyAttributeNames は新名から旧名への対応を宣言する', () => {
    expect(mapper.legacyAttributeNames.UserID).toEqual(['userId']);
    expect(mapper.legacyAttributeNames.UpdatedAt).toEqual(['updatedAt']);
  });
});
