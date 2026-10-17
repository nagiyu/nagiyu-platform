import { InvalidEntityDataError } from '@nagiyu/aws';
import { GroupListMapper } from '../../../../src/repositories/list/group-list-mapper.js';
import type { GroupList } from '../../../../src/types/index.js';

const CREATED_AT = 1704067200000;
const UPDATED_AT = 1704067300000;

function buildList(overrides: Partial<GroupList> = {}): GroupList {
  return {
    listId: 'list-1',
    groupId: 'group-1',
    name: '共有リスト',
    createdBy: 'user-1',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'GROUP#group-1',
    SK: 'GLIST#list-1',
    Type: 'GroupList',
    ListID: 'list-1',
    GroupID: 'group-1',
    Name: '共有リスト',
    CreatedBy: 'user-1',
    CreatedAt: CREATED_AT,
    UpdatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildLegacyItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'GROUP#group-1',
    SK: 'GLIST#list-1',
    listId: 'list-1',
    groupId: 'group-1',
    name: '共有リスト',
    createdBy: 'user-1',
    createdAt: new Date(CREATED_AT).toISOString(),
    updatedAt: new Date(UPDATED_AT).toISOString(),
    ...overrides,
  };
}

describe('GroupListMapper', () => {
  const mapper = new GroupListMapper();

  it('entityType は GroupList になる', () => {
    expect(mapper.entityType).toBe('GroupList');
  });

  it('buildKeys は PK を先頭にした PK/SK を返す', () => {
    const keys = mapper.buildKeys({ groupId: 'group-1', listId: 'list-1' });
    expect(keys).toEqual({ PK: 'GROUP#group-1', SK: 'GLIST#list-1' });
    expect(Object.keys(keys)[0]).toBe('PK');
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildList())).toEqual({ groupId: 'group-1', listId: 'list-1' });
  });

  it('toItem は保存形式 (PascalCase・数値ミリ秒・Type) の Item に変換する', () => {
    expect(mapper.toItem(buildList())).toEqual(buildItem());
  });

  describe('toEntity', () => {
    it('新形式の Item を往復で変換できる', () => {
      expect(mapper.toEntity(mapper.toItem(buildList()))).toEqual(buildList());
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
      expect(mapper.toEntity(buildItem({ name: '旧名' })).name).toBe('共有リスト');
    });

    it('空の name は許容する', () => {
      expect(mapper.toEntity(buildItem({ Name: '' })).name).toBe('');
    });

    it.each(['ListID', 'GroupID', 'Name', 'CreatedBy', 'CreatedAt', 'UpdatedAt'])(
      '必須の %s がない Item は InvalidEntityDataError をスローする',
      (attribute) => {
        expect(() => mapper.toEntity(buildItem({ [attribute]: undefined }))).toThrow(
          InvalidEntityDataError
        );
      }
    );

    it('時刻が不正な Item は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ UpdatedAt: 'invalid' }))).toThrow(
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
      ['groupId', { groupId: 'group-1' }],
      ['createdBy', { createdBy: 'user-1' }],
      ['createdAt', { createdAt: CREATED_AT }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes)).toThrow(InvalidEntityDataError);
      }
    );
  });

  it('legacyAttributeNames は新名から旧名への対応を宣言する', () => {
    expect(mapper.legacyAttributeNames.ListID).toEqual(['listId']);
    expect(mapper.legacyAttributeNames.CreatedBy).toEqual(['createdBy']);
    expect(mapper.legacyAttributeNames.UpdatedAt).toEqual(['updatedAt']);
  });
});
