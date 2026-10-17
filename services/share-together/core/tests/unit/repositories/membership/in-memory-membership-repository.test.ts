import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InMemorySingleTableStore,
} from '@nagiyu/aws';
import { InMemoryMembershipRepository } from '../../../../src/repositories/membership/in-memory-membership-repository.js';
import type { CreateGroupMembershipInput } from '../../../../src/types/index.js';

const INVITED_AT = Date.UTC(2026, 0, 1);
const EXPIRES_AT = Date.UTC(2026, 0, 2);

function membershipInput(
  overrides: Partial<CreateGroupMembershipInput> = {}
): CreateGroupMembershipInput {
  return {
    groupId: 'group-1',
    userId: 'user-1',
    role: 'MEMBER',
    status: 'ACCEPTED',
    ...overrides,
  };
}

function legacyItem(groupId: string, userId: string, status: string): Record<string, unknown> {
  return {
    PK: `GROUP#${groupId}`,
    SK: `MEMBER#${userId}`,
    GSI1PK: `USER#${userId}`,
    GSI1SK: `GROUP#${groupId}`,
    groupId,
    userId,
    role: 'MEMBER',
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('InMemoryMembershipRepository', () => {
  let repository: InMemoryMembershipRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryMembershipRepository(store);
  });

  it('数値ミリ秒の時刻付きで作成し、IDで取得できる', async () => {
    const before = Date.now();
    const created = await repository.create(membershipInput());

    expect(created).toMatchObject(membershipInput());
    expect(created.createdAt).toBeGreaterThanOrEqual(before);
    expect(created.updatedAt).toBeGreaterThanOrEqual(created.createdAt);
    await expect(repository.getById('group-1', 'user-1')).resolves.toEqual(created);
  });

  it('共有ストアに保存形式の Item を書き、有効期限は TTL をエポック秒で持つ', async () => {
    await repository.create(
      membershipInput({
        status: 'PENDING',
        invitedBy: 'owner-1',
        invitedAt: INVITED_AT,
        expiresAt: EXPIRES_AT,
      })
    );

    expect(store.get('GROUP#group-1', 'MEMBER#user-1')).toMatchObject({
      Type: 'GroupMembership',
      GSI1PK: 'USER#user-1',
      GSI1SK: 'GROUP#group-1',
      GroupID: 'group-1',
      UserID: 'user-1',
      Role: 'MEMBER',
      Status: 'PENDING',
      InvitedBy: 'owner-1',
      InvitedAt: INVITED_AT,
      TTL: EXPIRES_AT / 1000,
    });
  });

  it('同じグループ・ユーザーを作成すると EntityAlreadyExistsError をスローする', async () => {
    await repository.create(membershipInput());
    await expect(repository.create(membershipInput())).rejects.toThrow(EntityAlreadyExistsError);
  });

  it('存在しないメンバーシップは null を返す', async () => {
    await expect(repository.getById('group-1', 'none')).resolves.toBeNull();
  });

  describe('一覧', () => {
    it('グループの一覧はそのグループだけをユーザー ID 順で返す', async () => {
      await repository.create(membershipInput({ userId: 'user-b' }));
      await repository.create(membershipInput({ userId: 'user-a' }));
      await repository.create(membershipInput({ groupId: 'group-2', userId: 'user-x' }));

      const memberships = await repository.getByGroupId('group-1');

      expect(memberships.map((membership) => membership.userId)).toEqual(['user-a', 'user-b']);
    });

    it('グループの一覧は既定の件数上限を超えても全件返す', async () => {
      for (let index = 0; index < 120; index++) {
        await repository.create(
          membershipInput({ userId: `user-${String(index).padStart(3, '0')}` })
        );
      }

      await expect(repository.getByGroupId('group-1')).resolves.toHaveLength(120);
    });

    it('メンバーのいないグループの一覧は空配列を返す', async () => {
      await expect(repository.getByGroupId('group-none')).resolves.toEqual([]);
    });

    it('ユーザーの一覧はそのユーザーの所属だけをグループ ID 順で返す', async () => {
      await repository.create(membershipInput({ groupId: 'group-b' }));
      await repository.create(membershipInput({ groupId: 'group-a' }));
      await repository.create(membershipInput({ groupId: 'group-c', userId: 'user-2' }));

      const memberships = await repository.getByUserId('user-1');

      expect(memberships.map((membership) => membership.groupId)).toEqual(['group-a', 'group-b']);
    });

    it('ユーザーの一覧は既定の件数上限を超えても全件返す', async () => {
      for (let index = 0; index < 120; index++) {
        await repository.create(
          membershipInput({ groupId: `group-${String(index).padStart(3, '0')}` })
        );
      }

      await expect(repository.getByUserId('user-1')).resolves.toHaveLength(120);
    });
  });

  describe('getPendingInvitationsByUserId', () => {
    it('そのユーザーの PENDING の招待だけを返す', async () => {
      await repository.create(membershipInput({ groupId: 'group-1', status: 'PENDING' }));
      await repository.create(membershipInput({ groupId: 'group-2', status: 'ACCEPTED' }));
      await repository.create(membershipInput({ groupId: 'group-3', status: 'REJECTED' }));
      await repository.create(
        membershipInput({ groupId: 'group-4', userId: 'user-2', status: 'PENDING' })
      );

      const invitations = await repository.getPendingInvitationsByUserId('user-1');

      expect(invitations.map((invitation) => invitation.groupId)).toEqual(['group-1']);
    });

    it('旧形式 (小文字の status) の招待も返す', async () => {
      store.put(legacyItem('group-1', 'user-1', 'PENDING') as never);
      store.put(legacyItem('group-2', 'user-1', 'ACCEPTED') as never);

      const invitations = await repository.getPendingInvitationsByUserId('user-1');

      expect(invitations.map((invitation) => invitation.groupId)).toEqual(['group-1']);
      expect(invitations[0].createdAt).toBe(Date.UTC(2026, 0, 1));
    });
  });

  describe('update', () => {
    it('指定した項目だけを変え、updatedAt を進める', async () => {
      const created = await repository.create(
        membershipInput({
          status: 'PENDING',
          invitedBy: 'owner-1',
          invitedAt: INVITED_AT,
          expiresAt: EXPIRES_AT,
        })
      );

      const updated = await repository.update('group-1', 'user-1', {
        status: 'ACCEPTED',
        respondedAt: EXPIRES_AT,
      });

      expect(updated).toMatchObject({
        status: 'ACCEPTED',
        respondedAt: EXPIRES_AT,
        invitedBy: 'owner-1',
        invitedAt: INVITED_AT,
        expiresAt: EXPIRES_AT,
        createdAt: created.createdAt,
      });
      expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
      await expect(repository.getById('group-1', 'user-1')).resolves.toEqual(updated);
    });

    it('null を渡した任意項目は削除され、undefined の項目は残る', async () => {
      await repository.create(
        membershipInput({
          status: 'PENDING',
          invitedBy: 'owner-1',
          invitedAt: INVITED_AT,
          expiresAt: EXPIRES_AT,
        })
      );

      const responded = await repository.update('group-1', 'user-1', {
        status: 'ACCEPTED',
        respondedAt: EXPIRES_AT,
        expiresAt: null,
      });
      expect(responded).not.toHaveProperty('expiresAt');
      expect(responded.invitedBy).toBe('owner-1');
      expect(store.get('GROUP#group-1', 'MEMBER#user-1')).not.toHaveProperty('TTL');

      const reinvited = await repository.update('group-1', 'user-1', {
        status: 'PENDING',
        respondedAt: null,
        invitedBy: null,
        invitedAt: null,
      });
      expect(reinvited).not.toHaveProperty('respondedAt');
      expect(reinvited).not.toHaveProperty('invitedBy');
      expect(reinvited).not.toHaveProperty('invitedAt');
    });

    it('旧形式のアイテムを更新すると、旧名の属性が残らない', async () => {
      store.put(legacyItem('group-1', 'user-1', 'PENDING') as never);

      await repository.update('group-1', 'user-1', { status: 'ACCEPTED' });

      const stored = store.get('GROUP#group-1', 'MEMBER#user-1');
      expect(stored).toMatchObject({ Status: 'ACCEPTED' });
      expect(stored).not.toHaveProperty('status');
    });

    it('更新しても GSI1 の属性が保たれ、ユーザーの一覧に出続ける', async () => {
      await repository.create(membershipInput({ status: 'PENDING' }));

      await repository.update('group-1', 'user-1', { status: 'ACCEPTED' });

      expect(store.get('GROUP#group-1', 'MEMBER#user-1')).toMatchObject({
        GSI1PK: 'USER#user-1',
        GSI1SK: 'GROUP#group-1',
      });
      await expect(repository.getByUserId('user-1')).resolves.toHaveLength(1);
    });

    it('存在しないメンバーシップの更新は EntityNotFoundError をスローし、アイテムを作らない', async () => {
      await expect(repository.update('group-1', 'none', { status: 'ACCEPTED' })).rejects.toThrow(
        EntityNotFoundError
      );

      expect(store.get('GROUP#group-1', 'MEMBER#none')).toBeUndefined();
      expect(store.size()).toBe(0);
    });
  });

  describe('delete', () => {
    it('削除すると取得できなくなる', async () => {
      await repository.create(membershipInput());

      await repository.delete('group-1', 'user-1');

      await expect(repository.getById('group-1', 'user-1')).resolves.toBeNull();
      await expect(repository.getByUserId('user-1')).resolves.toEqual([]);
    });

    it('存在しないメンバーシップの削除は EntityNotFoundError をスローする', async () => {
      await expect(repository.delete('group-1', 'none')).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('deleteByGroupId', () => {
    it('そのグループのメンバーシップだけを削除する', async () => {
      await repository.create(membershipInput({ userId: 'user-1' }));
      await repository.create(membershipInput({ userId: 'user-2' }));
      await repository.create(membershipInput({ groupId: 'group-2', userId: 'user-1' }));

      await repository.deleteByGroupId('group-1');

      await expect(repository.getByGroupId('group-1')).resolves.toEqual([]);
      await expect(repository.getByUserId('user-1')).resolves.toHaveLength(1);
      await expect(repository.getByUserId('user-2')).resolves.toEqual([]);
    });

    it('メンバーシップがなくても成功する (冪等)', async () => {
      await expect(repository.deleteByGroupId('group-none')).resolves.toBeUndefined();
    });

    it('2 回続けて実行しても成功する (冪等)', async () => {
      await repository.create(membershipInput());

      await repository.deleteByGroupId('group-1');
      await expect(repository.deleteByGroupId('group-1')).resolves.toBeUndefined();
    });

    it('同じ PK の別種別のアイテムは消さない', async () => {
      store.put({ PK: 'GROUP#group-1', SK: '#META#', Type: 'Group', CreatedAt: 1, UpdatedAt: 1 });
      await repository.create(membershipInput());

      await repository.deleteByGroupId('group-1');

      expect(store.get('GROUP#group-1', '#META#')).toBeDefined();
    });
  });
});
