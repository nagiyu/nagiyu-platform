import type {
  GroupMembership,
  GroupRepository,
  ListRepository,
  MembershipRepository,
  TodoRepository,
} from '../../../src/index.js';
import {
  calculateInvitationTtl,
  createGroup,
  deleteGroupWithCascade,
  ERROR_MESSAGES,
  inviteMember,
  leaveGroup,
  removeMember,
  respondToInvitation,
  validateMemberLimit,
  validateNoDuplicateInvitation,
  validateOwnerCanBeRemoved,
  validateOwnerCanLeave,
} from '../../../src/libs/group.js';

describe('group library', () => {
  const createMembership = (overrides: Partial<GroupMembership> = {}): GroupMembership => ({
    groupId: 'group-1',
    userId: 'user-1',
    role: 'MEMBER',
    status: 'ACCEPTED',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });

  it('承認済みメンバーが5名以上の場合は上限エラーになる', () => {
    const memberships = [1, 2, 3, 4, 5].map((index) =>
      createMembership({ userId: `user-${index}` })
    );

    expect(() => validateMemberLimit(memberships)).toThrow(ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED);
  });

  it('PENDINGを含んでも承認済みメンバーが4名以下なら上限エラーにならない', () => {
    const memberships = [
      createMembership({ userId: 'user-1', status: 'ACCEPTED' }),
      createMembership({ userId: 'user-2', status: 'ACCEPTED' }),
      createMembership({ userId: 'user-3', status: 'ACCEPTED' }),
      createMembership({ userId: 'user-4', status: 'ACCEPTED' }),
      createMembership({ userId: 'user-5', status: 'PENDING' }),
    ];

    expect(() => validateMemberLimit(memberships)).not.toThrow();
  });

  it('オーナーが脱退しようとした場合はエラーになる', () => {
    const ownerMembership = createMembership({ role: 'OWNER' });

    expect(() => validateOwnerCanLeave(ownerMembership)).toThrow(ERROR_MESSAGES.OWNER_CANNOT_LEAVE);
  });

  it('オーナー以外は脱退可能', () => {
    const memberMembership = createMembership({ role: 'MEMBER' });

    expect(() => validateOwnerCanLeave(memberMembership)).not.toThrow();
  });

  it('オーナーを除外しようとした場合はエラーになる', () => {
    const ownerMembership = createMembership({ role: 'OWNER' });

    expect(() => validateOwnerCanBeRemoved(ownerMembership)).toThrow(
      ERROR_MESSAGES.OWNER_CANNOT_BE_REMOVED
    );
  });

  it('招待がPENDINGの場合は重複招待エラーになる', () => {
    const pendingMembership = createMembership({ status: 'PENDING' });

    expect(() => validateNoDuplicateInvitation(pendingMembership)).toThrow(
      ERROR_MESSAGES.DUPLICATE_INVITATION
    );
  });

  it('既存メンバーシップがPENDING以外なら重複招待エラーにならない', () => {
    expect(() =>
      validateNoDuplicateInvitation(createMembership({ status: 'ACCEPTED' }))
    ).not.toThrow();
    expect(() =>
      validateNoDuplicateInvitation(createMembership({ status: 'REJECTED' }))
    ).not.toThrow();
    expect(() => validateNoDuplicateInvitation(null)).not.toThrow();
  });

  it('招待TTLは招待時刻から86400秒で計算される', () => {
    expect(calculateInvitationTtl('2026-01-01T00:00:00.000Z')).toBe(1767312000);
  });

  it('グループ作成時にオーナーのメンバーシップも作成する', async () => {
    const groupRepository: GroupRepository = {
      getById: jest.fn(),
      batchGetByIds: jest.fn(),
      create: jest.fn().mockResolvedValue({
        groupId: 'group-1',
        name: 'グループ1',
        ownerUserId: 'owner-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const membershipRepository: MembershipRepository = {
      getById: jest.fn(),
      getByGroupId: jest.fn(),
      getByUserId: jest.fn(),
      getPendingInvitationsByUserId: jest.fn(),
      create: jest.fn().mockResolvedValue(createMembership({ role: 'OWNER', userId: 'owner-1' })),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByGroupId: jest.fn(),
    };

    await createGroup(
      {
        groupId: 'group-1',
        name: 'グループ1',
        ownerUserId: 'owner-1',
      },
      { groupRepository, membershipRepository }
    );

    expect(groupRepository.create).toHaveBeenCalledWith({
      groupId: 'group-1',
      name: 'グループ1',
      ownerUserId: 'owner-1',
    });
    expect(membershipRepository.create).toHaveBeenCalledWith({
      groupId: 'group-1',
      userId: 'owner-1',
      role: 'OWNER',
      status: 'ACCEPTED',
    });
  });

  it('メンバー招待時にPENDINGでTTL付きメンバーシップを作成する', async () => {
    const groupRepository: GroupRepository = {
      getById: jest.fn(),
      batchGetByIds: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const membershipRepository: MembershipRepository = {
      getById: jest.fn().mockResolvedValue(null),
      getByGroupId: jest.fn().mockResolvedValue([createMembership({ role: 'OWNER', userId: 'owner-1' })]),
      getByUserId: jest.fn(),
      getPendingInvitationsByUserId: jest.fn(),
      create: jest.fn().mockResolvedValue(createMembership({ status: 'PENDING', userId: 'user-2' })),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByGroupId: jest.fn(),
    };

    await inviteMember(
      {
        groupId: 'group-1',
        userId: 'user-2',
        invitedBy: 'owner-1',
        invitedAt: '2026-01-01T00:00:00.000Z',
      },
      { groupRepository, membershipRepository }
    );

    expect(membershipRepository.create).toHaveBeenCalledWith({
      groupId: 'group-1',
      userId: 'user-2',
      role: 'MEMBER',
      status: 'PENDING',
      invitedBy: 'owner-1',
      invitedAt: '2026-01-01T00:00:00.000Z',
      ttl: 1767312000,
    });
  });

  it('招待承認時にステータス更新とTTLクリアを行う', async () => {
    const groupRepository: GroupRepository = {
      getById: jest.fn(),
      batchGetByIds: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const membershipRepository: MembershipRepository = {
      getById: jest.fn().mockResolvedValue(createMembership({ status: 'PENDING', userId: 'user-2', ttl: 1 })),
      getByGroupId: jest.fn(),
      getByUserId: jest.fn(),
      getPendingInvitationsByUserId: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(createMembership({ status: 'ACCEPTED', userId: 'user-2' })),
      delete: jest.fn(),
      deleteByGroupId: jest.fn(),
    };

    await respondToInvitation(
      {
        groupId: 'group-1',
        userId: 'user-2',
        response: 'ACCEPT',
        respondedAt: '2026-01-02T00:00:00.000Z',
      },
      { groupRepository, membershipRepository }
    );

    expect(membershipRepository.update).toHaveBeenCalledWith('group-1', 'user-2', {
      status: 'ACCEPTED',
      respondedAt: '2026-01-02T00:00:00.000Z',
      ttl: undefined,
    });
  });

  it('一般メンバーは脱退・オーナーは除外される', async () => {
    const groupRepository: GroupRepository = {
      getById: jest.fn(),
      batchGetByIds: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const membershipRepository: MembershipRepository = {
      getById: jest
        .fn()
        .mockResolvedValueOnce(createMembership({ role: 'MEMBER', userId: 'user-2' }))
        .mockResolvedValueOnce(createMembership({ role: 'OWNER', userId: 'owner-1' })),
      getByGroupId: jest.fn(),
      getByUserId: jest.fn(),
      getPendingInvitationsByUserId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      deleteByGroupId: jest.fn(),
    };

    await leaveGroup({ groupId: 'group-1', userId: 'user-2' }, { groupRepository, membershipRepository });
    expect(membershipRepository.delete).toHaveBeenCalledWith('group-1', 'user-2');

    await expect(removeMember('group-1', 'owner-1', { groupRepository, membershipRepository })).rejects.toThrow(
      ERROR_MESSAGES.OWNER_CANNOT_BE_REMOVED
    );
  });

  it('グループ削除時にメンバーシップ・共有リスト・ToDoをカスケード削除する', async () => {
    const groupRepository: GroupRepository = {
      getById: jest.fn(),
      batchGetByIds: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const membershipRepository: MembershipRepository = {
      getById: jest.fn(),
      getByGroupId: jest.fn(),
      getByUserId: jest.fn(),
      getPendingInvitationsByUserId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByGroupId: jest.fn().mockResolvedValue(undefined),
    };
    const listRepository: ListRepository = {
      getPersonalListsByUserId: jest.fn(),
      getPersonalListById: jest.fn(),
      createPersonalList: jest.fn(),
      updatePersonalList: jest.fn(),
      deletePersonalList: jest.fn(),
      getGroupListsByGroupId: jest.fn().mockResolvedValue([
        {
          listId: 'group-list-1',
          groupId: 'group-1',
          name: '共有リスト1',
          createdBy: 'owner-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          listId: 'group-list-2',
          groupId: 'group-1',
          name: '共有リスト2',
          createdBy: 'owner-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
      getGroupListById: jest.fn(),
      createGroupList: jest.fn(),
      updateGroupList: jest.fn(),
      deleteGroupList: jest.fn().mockResolvedValue(undefined),
    };
    const todoRepository: TodoRepository = {
      getByListId: jest.fn(),
      getById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByListId: jest.fn().mockResolvedValue(undefined),
    };

    await deleteGroupWithCascade('group-1', {
      groupRepository,
      membershipRepository,
      listRepository,
      todoRepository,
    });

    expect(todoRepository.deleteByListId).toHaveBeenCalledTimes(2);
    expect(todoRepository.deleteByListId).toHaveBeenNthCalledWith(1, 'group-list-1');
    expect(todoRepository.deleteByListId).toHaveBeenNthCalledWith(2, 'group-list-2');
    expect(listRepository.deleteGroupList).toHaveBeenCalledTimes(2);
    expect(listRepository.deleteGroupList).toHaveBeenNthCalledWith(1, 'group-1', 'group-list-1');
    expect(listRepository.deleteGroupList).toHaveBeenNthCalledWith(2, 'group-1', 'group-list-2');
    expect(membershipRepository.deleteByGroupId).toHaveBeenCalledWith('group-1');
    expect(groupRepository.delete).toHaveBeenCalledWith('group-1');
  });
});
