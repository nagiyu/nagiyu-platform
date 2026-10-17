import { InvalidEntityDataError } from '@nagiyu/aws';
import { PersonalListMapper } from '../../../../src/repositories/list/personal-list-mapper.js';
import type { PersonalList } from '../../../../src/types/index.js';

const CREATED_AT = 1704067200000;
const UPDATED_AT = 1704067300000;

function buildList(overrides: Partial<PersonalList> = {}): PersonalList {
  return {
    listId: 'list-1',
    userId: 'user-1',
    name: '買い物',
    isDefault: false,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#user-1',
    SK: 'PLIST#list-1',
    Type: 'PersonalList',
    ListID: 'list-1',
    UserID: 'user-1',
    Name: '買い物',
    IsDefault: false,
    CreatedAt: CREATED_AT,
    UpdatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildLegacyItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#user-1',
    SK: 'PLIST#list-1',
    listId: 'list-1',
    userId: 'user-1',
    name: '買い物',
    isDefault: false,
    createdAt: new Date(CREATED_AT).toISOString(),
    updatedAt: new Date(UPDATED_AT).toISOString(),
    ...overrides,
  };
}

describe('PersonalListMapper', () => {
  const mapper = new PersonalListMapper();

  it('entityType は PersonalList になる', () => {
    expect(mapper.entityType).toBe('PersonalList');
  });

  it('buildKeys は PK を先頭にした PK/SK を返す', () => {
    const keys = mapper.buildKeys({ userId: 'user-1', listId: 'list-1' });
    expect(keys).toEqual({ PK: 'USER#user-1', SK: 'PLIST#list-1' });
    expect(Object.keys(keys)[0]).toBe('PK');
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildList())).toEqual({ userId: 'user-1', listId: 'list-1' });
  });

  it('toItem は保存形式 (PascalCase・数値ミリ秒・Type) の Item に変換する', () => {
    expect(mapper.toItem(buildList())).toEqual(buildItem());
  });

  describe('toEntity', () => {
    it.each([true, false])('新形式の Item を往復で変換できる (isDefault=%s)', (isDefault) => {
      const list = buildList({ isDefault });
      expect(mapper.toEntity(mapper.toItem(list))).toEqual(list);
    });

    it('PK/SK/Type を Entity に含めない', () => {
      const entity = mapper.toEntity(buildItem());
      for (const name of ['PK', 'SK', 'Type']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it('旧形式 (camelCase の属性名と ISO 文字列の時刻) を読める', () => {
      expect(mapper.toEntity(buildLegacyItem())).toEqual(buildList());
    });

    it('新名が旧名より優先される', () => {
      expect(mapper.toEntity(buildItem({ name: '旧名' })).name).toBe('買い物');
    });

    it('空の name は許容する', () => {
      expect(mapper.toEntity(buildItem({ Name: '' })).name).toBe('');
    });

    it.each(['ListID', 'UserID', 'Name', 'IsDefault', 'CreatedAt', 'UpdatedAt'])(
      '必須の %s がない Item は InvalidEntityDataError をスローする',
      (attribute) => {
        expect(() => mapper.toEntity(buildItem({ [attribute]: undefined }))).toThrow(
          InvalidEntityDataError
        );
      }
    );

    it('IsDefault が真偽値でない Item は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ IsDefault: 'true' }))).toThrow(
        InvalidEntityDataError
      );
    });

    it('時刻が不正な Item は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ CreatedAt: 'invalid' }))).toThrow(
        InvalidEntityDataError
      );
    });
  });

  describe('toUpdateAttributes', () => {
    it('name を保存用の属性名に変換し、他の項目は含めない', () => {
      const attributes = mapper.toUpdateAttributes({ name: '新しい名前' });
      expect(attributes.Name).toBe('新しい名前');
      expect(attributes.ListID).toBeUndefined();
      expect(attributes).not.toHaveProperty('PK');
      expect(attributes).not.toHaveProperty('SK');
    });

    it('必須項目 name を null にすると InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toUpdateAttributes({ name: null })).toThrow(InvalidEntityDataError);
    });

    it.each([
      ['listId', { listId: 'list-1' }],
      ['userId', { userId: 'user-1' }],
      ['createdAt', { createdAt: CREATED_AT }],
      ['isDefault', { isDefault: false }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes)).toThrow(InvalidEntityDataError);
      }
    );
  });

  it('legacyAttributeNames は新名から旧名への対応を宣言する', () => {
    expect(mapper.legacyAttributeNames.ListID).toEqual(['listId']);
    expect(mapper.legacyAttributeNames.IsDefault).toEqual(['isDefault']);
    expect(mapper.legacyAttributeNames.UpdatedAt).toEqual(['updatedAt']);
  });
});
