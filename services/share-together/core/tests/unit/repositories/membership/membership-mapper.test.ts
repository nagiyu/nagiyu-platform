import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { GroupMembershipMapper } from '../../../../src/repositories/membership/membership-mapper.js';
import type { GroupMembership } from '../../../../src/types/index.js';

const CREATED_AT = 1704067200000;
const UPDATED_AT = 1704067300000;
const INVITED_AT = 1704153600000;
const RESPONDED_AT = 1704160000000;
// 招待の有効期限は INVITED_AT の 1 日後。TTL 属性では秒に換算して保存する
const EXPIRES_AT = INVITED_AT + 86400 * 1000;

function buildMembership(overrides: Partial<GroupMembership> = {}): GroupMembership {
  return {
    groupId: 'group-1',
    userId: 'user-1',
    role: 'MEMBER',
    status: 'ACCEPTED',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'GROUP#group-1',
    SK: 'MEMBER#user-1',
    GSI1PK: 'USER#user-1',
    GSI1SK: 'GROUP#group-1',
    Type: 'GroupMembership',
    GroupID: 'group-1',
    UserID: 'user-1',
    Role: 'MEMBER',
    Status: 'ACCEPTED',
    CreatedAt: CREATED_AT,
    UpdatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildLegacyItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'GROUP#group-1',
    SK: 'MEMBER#user-1',
    GSI1PK: 'USER#user-1',
    GSI1SK: 'GROUP#group-1',
    groupId: 'group-1',
    userId: 'user-1',
    role: 'MEMBER',
    status: 'ACCEPTED',
    createdAt: new Date(CREATED_AT).toISOString(),
    updatedAt: new Date(UPDATED_AT).toISOString(),
    ...overrides,
  };
}

describe('GroupMembershipMapper', () => {
  const mapper = new GroupMembershipMapper();

  it('entityType は GroupMembership になる', () => {
    expect(mapper.entityType).toBe('GroupMembership');
  });

  it('buildKeys は PK を先頭にした PK/SK を返す', () => {
    const keys = mapper.buildKeys({ groupId: 'group-1', userId: 'user-1' });
    expect(keys).toEqual({ PK: 'GROUP#group-1', SK: 'MEMBER#user-1' });
    expect(Object.keys(keys)[0]).toBe('PK');
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildMembership())).toEqual({ groupId: 'group-1', userId: 'user-1' });
  });

  describe('toItem', () => {
    it('保存形式 (PascalCase・数値ミリ秒・Type・GSI1) の Item に変換し、任意項目は属性ごと省く', () => {
      const item = mapper.toItem(buildMembership());
      expect(item).toEqual(buildItem());
      for (const name of ['InvitedBy', 'InvitedAt', 'RespondedAt', 'TTL']) {
        expect(item).not.toHaveProperty(name);
      }
    });

    it('招待の項目を保存し、expiresAt を TTL 属性のエポック秒に換算する', () => {
      const item = mapper.toItem(
        buildMembership({
          status: 'PENDING',
          invitedBy: 'owner-1',
          invitedAt: INVITED_AT,
          respondedAt: RESPONDED_AT,
          expiresAt: EXPIRES_AT,
        })
      );
      expect(item).toMatchObject({
        InvitedBy: 'owner-1',
        InvitedAt: INVITED_AT,
        RespondedAt: RESPONDED_AT,
        TTL: EXPIRES_AT / 1000,
      });
    });

    it('秒未満の expiresAt は切り捨てて TTL にする', () => {
      expect(mapper.toItem(buildMembership({ expiresAt: 1704153600999 })).TTL).toBe(1704153600);
    });
  });

  describe('toEntity', () => {
    it.each([
      ['任意項目なし', buildMembership()],
      [
        '招待中',
        buildMembership({
          status: 'PENDING',
          invitedBy: 'owner-1',
          invitedAt: INVITED_AT,
          expiresAt: EXPIRES_AT,
        }),
      ],
      [
        '応答済み',
        buildMembership({ invitedBy: 'owner-1', invitedAt: INVITED_AT, respondedAt: RESPONDED_AT }),
      ],
    ])('新形式の Item を往復で変換できる (%s)', (_label, membership) => {
      expect(mapper.toEntity(mapper.toItem(membership))).toEqual(membership);
    });

    it('PK/SK/GSI1/Type を Entity に含めない', () => {
      const entity = mapper.toEntity(buildItem());
      for (const name of ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'Type']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it('任意項目がない Item では、そのキーを持たない', () => {
      const entity = mapper.toEntity(buildItem());
      for (const name of ['invitedBy', 'invitedAt', 'respondedAt', 'expiresAt']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it('旧形式 (camelCase の属性名と ISO 文字列の時刻) を読める', () => {
      expect(mapper.toEntity(buildLegacyItem())).toEqual(buildMembership());
    });

    it('旧形式の招待の項目と TTL (エポック秒) を読み、expiresAt をミリ秒で返す', () => {
      const entity = mapper.toEntity(
        buildLegacyItem({
          status: 'PENDING',
          invitedBy: 'owner-1',
          invitedAt: new Date(INVITED_AT).toISOString(),
          respondedAt: new Date(RESPONDED_AT).toISOString(),
          TTL: EXPIRES_AT / 1000,
        })
      );
      expect(entity).toEqual(
        buildMembership({
          status: 'PENDING',
          invitedBy: 'owner-1',
          invitedAt: INVITED_AT,
          respondedAt: RESPONDED_AT,
          expiresAt: EXPIRES_AT,
        })
      );
    });

    it('新名が旧名より優先される', () => {
      expect(mapper.toEntity(buildItem({ status: 'PENDING', role: 'OWNER' }))).toMatchObject({
        status: 'ACCEPTED',
        role: 'MEMBER',
      });
    });

    it.each(['GroupID', 'UserID', 'Role', 'Status', 'CreatedAt', 'UpdatedAt'])(
      '必須の %s がない Item は InvalidEntityDataError をスローする',
      (attribute) => {
        expect(() => mapper.toEntity(buildItem({ [attribute]: undefined }))).toThrow(
          InvalidEntityDataError
        );
      }
    );

    it.each([
      ['Role', { Role: 'ADMIN' }],
      ['Status', { Status: 'UNKNOWN' }],
      ['旧形式の role', { Role: undefined, role: 'ADMIN' }],
      ['旧形式の status', { Status: undefined, status: 'UNKNOWN' }],
    ])('%s が許可されない値の Item は InvalidEntityDataError をスローする', (_label, overrides) => {
      expect(() => mapper.toEntity(buildItem(overrides))).toThrow(InvalidEntityDataError);
    });

    it('InvitedBy が文字列でない Item は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ InvitedBy: 1 }))).toThrow(InvalidEntityDataError);
    });

    it.each(['InvitedAt', 'RespondedAt', 'TTL', 'CreatedAt'])(
      '%s が不正な Item は InvalidEntityDataError をスローする',
      (attribute) => {
        expect(() => mapper.toEntity(buildItem({ [attribute]: 'invalid' }))).toThrow(
          InvalidEntityDataError
        );
      }
    );
  });

  describe('toUpdateAttributes', () => {
    const key = { groupId: 'group-1', userId: 'user-1' };

    it('role / status / 任意項目を保存用の属性名に変換し、expiresAt を TTL の秒に換算する', () => {
      const attributes = mapper.toUpdateAttributes(
        {
          role: 'OWNER',
          status: 'PENDING',
          invitedBy: 'owner-1',
          invitedAt: INVITED_AT,
          respondedAt: RESPONDED_AT,
          expiresAt: EXPIRES_AT,
        },
        key
      );
      expect(attributes).toMatchObject({
        Role: 'OWNER',
        Status: 'PENDING',
        InvitedBy: 'owner-1',
        InvitedAt: INVITED_AT,
        RespondedAt: RESPONDED_AT,
        TTL: EXPIRES_AT / 1000,
      });
      expect(attributes).not.toHaveProperty('PK');
      expect(attributes).not.toHaveProperty('SK');
    });

    it('undefined の項目は変更しない', () => {
      const attributes = mapper.toUpdateAttributes({ status: 'ACCEPTED' }, key);
      expect(attributes.Role).toBeUndefined();
      expect(attributes.InvitedBy).toBeUndefined();
      expect(attributes.InvitedAt).toBeUndefined();
      expect(attributes.RespondedAt).toBeUndefined();
      expect(attributes.TTL).toBeUndefined();
    });

    it.each([
      ['invitedBy', { invitedBy: null }, 'InvitedBy'],
      ['invitedAt', { invitedAt: null }, 'InvitedAt'],
      ['respondedAt', { respondedAt: null }, 'RespondedAt'],
      ['expiresAt', { expiresAt: null }, 'TTL'],
    ] as const)(
      '任意項目 %s を null にすると属性の削除を指示する',
      (_field, changes, attribute) => {
        expect(mapper.toUpdateAttributes(changes, key)[attribute]).toBe(REMOVE_ATTRIBUTE);
      }
    );

    it('GSI1 を key から付け直す', () => {
      expect(mapper.toUpdateAttributes({ status: 'ACCEPTED' }, key)).toMatchObject({
        GSI1PK: 'USER#user-1',
        GSI1SK: 'GROUP#group-1',
      });
    });

    it.each([
      ['role', { role: null }],
      ['status', { status: null }],
    ] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes, key)).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['groupId', { groupId: 'group-1' }],
      ['userId', { userId: 'user-1' }],
      ['createdAt', { createdAt: CREATED_AT }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes, key)).toThrow(InvalidEntityDataError);
      }
    );
  });

  it('legacyAttributeNames は新名から旧名への対応を宣言する', () => {
    expect(mapper.legacyAttributeNames.GroupID).toEqual(['groupId']);
    expect(mapper.legacyAttributeNames.Status).toEqual(['status']);
    expect(mapper.legacyAttributeNames.RespondedAt).toEqual(['respondedAt']);
    expect(mapper.legacyAttributeNames.UpdatedAt).toEqual(['updatedAt']);
    // TTL は旧形式でも同じ名前のため、旧名として宣言しない
    expect(mapper.legacyAttributeNames).not.toHaveProperty('TTL');
  });
});
