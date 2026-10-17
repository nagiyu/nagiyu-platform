import { InvalidEntityDataError } from '@nagiyu/aws';
import { GroupMapper } from '../../../../src/repositories/group/group-mapper.js';
import type { Group } from '../../../../src/types/index.js';

const CREATED_AT = 1704067200000;
const UPDATED_AT = 1704067300000;

function buildGroup(overrides: Partial<Group> = {}): Group {
  return {
    groupId: 'group-123',
    name: 'テストグループ',
    ownerUserId: 'owner-1',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'GROUP#group-123',
    SK: '#META#',
    Type: 'Group',
    GroupID: 'group-123',
    Name: 'テストグループ',
    OwnerUserID: 'owner-1',
    CreatedAt: CREATED_AT,
    UpdatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildLegacyItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'GROUP#group-123',
    SK: '#META#',
    groupId: 'group-123',
    name: 'テストグループ',
    ownerUserId: 'owner-1',
    createdAt: new Date(CREATED_AT).toISOString(),
    updatedAt: new Date(UPDATED_AT).toISOString(),
    ...overrides,
  };
}

describe('GroupMapper', () => {
  const mapper = new GroupMapper();

  it('entityType は Group になる', () => {
    expect(mapper.entityType).toBe('Group');
  });

  it('buildKeys は PK を先頭にした PK/SK を返す', () => {
    const keys = mapper.buildKeys({ groupId: 'group-123' });
    expect(keys).toEqual({ PK: 'GROUP#group-123', SK: '#META#' });
    expect(Object.keys(keys)[0]).toBe('PK');
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildGroup())).toEqual({ groupId: 'group-123' });
  });

  it('toItem は保存形式 (PascalCase・数値ミリ秒・Type) の Item に変換する', () => {
    expect(mapper.toItem(buildGroup())).toEqual(buildItem());
  });

  describe('toEntity', () => {
    it('新形式の Item を Entity に変換する (往復で一致する)', () => {
      expect(mapper.toEntity(mapper.toItem(buildGroup()))).toEqual(buildGroup());
    });

    it('PK/SK/Type を Entity に含めない', () => {
      const entity = mapper.toEntity(buildItem());
      for (const name of ['PK', 'SK', 'Type']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it('旧形式 (camelCase の属性名と ISO 文字列の時刻) を読める', () => {
      expect(mapper.toEntity(buildLegacyItem())).toEqual(buildGroup());
    });

    it('新名が旧名より優先される', () => {
      expect(mapper.toEntity(buildItem({ name: '旧名' })).name).toBe('テストグループ');
    });

    it('空の name は許容する', () => {
      expect(mapper.toEntity(buildItem({ Name: '' })).name).toBe('');
    });

    it.each(['GroupID', 'Name', 'OwnerUserID', 'CreatedAt', 'UpdatedAt'])(
      '必須の %s がない Item は InvalidEntityDataError をスローする',
      (attribute) => {
        expect(() => mapper.toEntity(buildItem({ [attribute]: undefined }))).toThrow(
          InvalidEntityDataError
        );
      }
    );

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
      expect(attributes.GroupID).toBeUndefined();
      expect(attributes).not.toHaveProperty('PK');
      expect(attributes).not.toHaveProperty('SK');
    });

    it('必須項目 name を null にすると InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toUpdateAttributes({ name: null })).toThrow(InvalidEntityDataError);
    });

    it.each([
      ['groupId', { groupId: 'group-123' }],
      ['ownerUserId', { ownerUserId: 'owner-1' }],
      ['createdAt', { createdAt: CREATED_AT }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes)).toThrow(InvalidEntityDataError);
      }
    );
  });

  it('legacyAttributeNames は新名から旧名への対応を宣言する', () => {
    expect(mapper.legacyAttributeNames.GroupID).toEqual(['groupId']);
    expect(mapper.legacyAttributeNames.OwnerUserID).toEqual(['ownerUserId']);
    expect(mapper.legacyAttributeNames.UpdatedAt).toEqual(['updatedAt']);
  });
});
