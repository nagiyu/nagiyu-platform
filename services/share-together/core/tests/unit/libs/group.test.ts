import { EntityAlreadyExistsError, EntityNotFoundError } from '@nagiyu/aws';
import type {
  GroupMembership,
  GroupRepository,
  ListRepository,
  MembershipRepository,
  TodoRepository,
} from '../../../src/index.js';
import {
  calculateInvitationExpiresAt,
  createGroup,
  deleteGroupWithCascade,
  ERROR_MESSAGES,
  inviteMember,
  leaveGroup,
  removeMember,
  respondToInvitation,
  validateAcceptLimit,
  validateInviteLimit,
  validateNoDuplicateInvitation,
  validateOwnerCanBeRemoved,
  validateOwnerCanLeave,
} from '../../../src/libs/group.js';

const JAN_1 = Date.UTC(2026, 0, 1);
const JAN_2 = Date.UTC(2026, 0, 2);

describe('group library', () => {
  const createMembership = (overrides: Partial<GroupMembership> = {}): GroupMembership => ({
    groupId: 'group-1',
    userId: 'user-1',
    role: 'MEMBER',
    status: 'ACCEPTED',
    createdAt: JAN_1,
    updatedAt: JAN_1,
    ...overrides,
  });

  const createAcceptedMembers = (count: number): GroupMembership[] =>
    Array.from({ length: count }, (_, index) =>
      createMembership({ userId: `accepted-${index + 1}`, status: 'ACCEPTED' })
    );

  describe('validateAcceptLimit', () => {
    it('承認済みメンバーが5名以上の場合は上限エラーになる', () => {
      expect(() => validateAcceptLimit(createAcceptedMembers(5))).toThrow(
        ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED
      );
    });

    it('承認待ちを数えず、承認済みメンバーが4名以下なら上限エラーにならない', () => {
      const memberships = [
        ...createAcceptedMembers(4),
        createMembership({ userId: 'pending-1', status: 'PENDING', expiresAt: JAN_2 }),
      ];

      expect(() => validateAcceptLimit(memberships)).not.toThrow();
    });
  });

  describe('validateInviteLimit', () => {
    it('承認済みと承認待ちの合計が5名以上の場合は上限エラーになる', () => {
      const memberships = [
        ...createAcceptedMembers(3),
        createMembership({ userId: 'pending-1', status: 'PENDING', expiresAt: JAN_2 }),
        createMembership({ userId: 'pending-2', status: 'PENDING' }),
      ];

      expect(() => validateInviteLimit(memberships, JAN_1)).toThrow(
        ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED
      );
    });

    it('合計が4名以下なら上限エラーにならない', () => {
      const memberships = [
        ...createAcceptedMembers(3),
        createMembership({ userId: 'pending-1', status: 'PENDING', expiresAt: JAN_2 }),
      ];

      expect(() => validateInviteLimit(memberships, JAN_1)).not.toThrow();
    });

    it('期限切れの承認待ちは数えない', () => {
      const memberships = [
        ...createAcceptedMembers(3),
        createMembership({ userId: 'pending-1', status: 'PENDING', expiresAt: JAN_2 }),
        // 期限と同時刻の招待も、すでに無効として扱う
        createMembership({ userId: 'pending-2', status: 'PENDING', expiresAt: JAN_2 }),
      ];

      expect(() => validateInviteLimit(memberships, JAN_2)).not.toThrow();
    });

    it('拒否済みは数えない', () => {
      const memberships = [
        ...createAcceptedMembers(4),
        createMembership({ userId: 'rejected-1', status: 'REJECTED' }),
      ];

      expect(() => validateInviteLimit(memberships, JAN_1)).not.toThrow();
    });
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

  it('招待の有効期限は招待時刻から 1 日後のエポックミリ秒で計算される', () => {
    expect(calculateInvitationExpiresAt(JAN_1)).toBe(JAN_2);
  });

  it('グループ作成時にオーナーのメンバーシップも作成する', async () => {
    const groupRepository: GroupRepository = {
      getById: jest.fn(),
      batchGetByIds: jest.fn(),
      create: jest.fn().mockResolvedValue({
        groupId: 'group-1',
        name: 'グループ1',
        ownerUserId: 'owner-1',
        createdAt: 1767225600000,
        updatedAt: 1767225600000,
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

  it('メンバー招待時にPENDINGで有効期限付きメンバーシップを作成する', async () => {
    const groupRepository: GroupRepository = {
      getById: jest.fn(),
      batchGetByIds: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const membershipRepository: MembershipRepository = {
      getById: jest.fn().mockResolvedValue(null),
      getByGroupId: jest
        .fn()
        .mockResolvedValue([createMembership({ role: 'OWNER', userId: 'owner-1' })]),
      getByUserId: jest.fn(),
      getPendingInvitationsByUserId: jest.fn(),
      create: jest
        .fn()
        .mockResolvedValue(createMembership({ status: 'PENDING', userId: 'user-2' })),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByGroupId: jest.fn(),
    };

    await inviteMember(
      {
        groupId: 'group-1',
        userId: 'user-2',
        invitedBy: 'owner-1',
        invitedAt: JAN_1,
      },
      { groupRepository, membershipRepository }
    );

    expect(membershipRepository.create).toHaveBeenCalledWith({
      groupId: 'group-1',
      userId: 'user-2',
      role: 'MEMBER',
      status: 'PENDING',
      invitedBy: 'owner-1',
      invitedAt: JAN_1,
      expiresAt: JAN_2,
    });
  });

  it('招待承認時にステータス更新と有効期限のクリアを行う', async () => {
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
        .mockResolvedValue(createMembership({ status: 'PENDING', userId: 'user-2', expiresAt: 1 })),
      getByGroupId: jest
        .fn()
        .mockResolvedValue([createMembership({ role: 'OWNER', userId: 'owner-1' })]),
      getByUserId: jest.fn(),
      getPendingInvitationsByUserId: jest.fn(),
      create: jest.fn(),
      update: jest
        .fn()
        .mockResolvedValue(createMembership({ status: 'ACCEPTED', userId: 'user-2' })),
      delete: jest.fn(),
      deleteByGroupId: jest.fn(),
    };

    await respondToInvitation(
      {
        groupId: 'group-1',
        userId: 'user-2',
        response: 'ACCEPT',
        respondedAt: JAN_2,
      },
      { groupRepository, membershipRepository }
    );

    expect(membershipRepository.update).toHaveBeenCalledWith('group-1', 'user-2', {
      status: 'ACCEPTED',
      respondedAt: JAN_2,
      expiresAt: null,
    });
  });

  describe('招待時の人数上限', () => {
    const groupRepository: GroupRepository = {
      getById: jest.fn(),
      batchGetByIds: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const createRepository = (memberships: GroupMembership[]): MembershipRepository => ({
      getById: jest.fn().mockResolvedValue(null),
      getByGroupId: jest.fn().mockResolvedValue(memberships),
      getByUserId: jest.fn(),
      getPendingInvitationsByUserId: jest.fn(),
      create: jest
        .fn()
        .mockResolvedValue(createMembership({ status: 'PENDING', userId: 'user-9' })),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByGroupId: jest.fn(),
    });
    const invite = (membershipRepository: MembershipRepository): Promise<GroupMembership> =>
      inviteMember(
        { groupId: 'group-1', userId: 'user-9', invitedBy: 'owner-1', invitedAt: JAN_1 },
        { groupRepository, membershipRepository }
      );

    it('承認済み3名と承認待ち2名がいる場合は招待に失敗する', async () => {
      const membershipRepository = createRepository([
        ...createAcceptedMembers(3),
        createMembership({ userId: 'pending-1', status: 'PENDING', expiresAt: JAN_2 }),
        createMembership({ userId: 'pending-2', status: 'PENDING', expiresAt: JAN_2 }),
      ]);

      await expect(invite(membershipRepository)).rejects.toThrow(
        ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED
      );
      expect(membershipRepository.create).not.toHaveBeenCalled();
    });

    it('期限切れの承認待ちと拒否済みは数えずに招待できる', async () => {
      const membershipRepository = createRepository([
        ...createAcceptedMembers(3),
        createMembership({ userId: 'expired-1', status: 'PENDING', expiresAt: JAN_1 }),
        createMembership({ userId: 'rejected-1', status: 'REJECTED' }),
      ]);

      await expect(invite(membershipRepository)).resolves.toMatchObject({ status: 'PENDING' });
    });
  });

  describe('招待の応答時の人数上限', () => {
    const groupRepository: GroupRepository = {
      getById: jest.fn(),
      batchGetByIds: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const createRepository = (memberships: GroupMembership[]): MembershipRepository => ({
      getById: jest
        .fn()
        .mockResolvedValue(createMembership({ status: 'PENDING', userId: 'user-9', expiresAt: 1 })),
      getByGroupId: jest.fn().mockResolvedValue(memberships),
      getByUserId: jest.fn(),
      getPendingInvitationsByUserId: jest.fn(),
      create: jest.fn(),
      update: jest
        .fn()
        .mockImplementation(async (_groupId, userId, updates) =>
          createMembership({ userId, ...updates, status: updates.status ?? 'PENDING' })
        ),
      delete: jest.fn(),
      deleteByGroupId: jest.fn(),
    });
    const respond = (
      membershipRepository: MembershipRepository,
      response: 'ACCEPT' | 'REJECT'
    ): Promise<GroupMembership> =>
      respondToInvitation(
        { groupId: 'group-1', userId: 'user-9', response, respondedAt: JAN_2 },
        { groupRepository, membershipRepository }
      );

    it('承認済みが5名のグループでは承認に失敗し、招待は更新されない', async () => {
      const membershipRepository = createRepository([
        ...createAcceptedMembers(5),
        createMembership({ userId: 'user-9', status: 'PENDING' }),
      ]);

      await expect(respond(membershipRepository, 'ACCEPT')).rejects.toThrow(
        ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED
      );
      expect(membershipRepository.update).not.toHaveBeenCalled();
    });

    it('承認済みが4名のグループでは承認できる', async () => {
      const membershipRepository = createRepository([
        ...createAcceptedMembers(4),
        createMembership({ userId: 'user-9', status: 'PENDING' }),
      ]);

      await expect(respond(membershipRepository, 'ACCEPT')).resolves.toMatchObject({
        status: 'ACCEPTED',
      });
    });

    it('承認済みが5名でも拒否はできる', async () => {
      const membershipRepository = createRepository([
        ...createAcceptedMembers(5),
        createMembership({ userId: 'user-9', status: 'PENDING' }),
      ]);

      await expect(respond(membershipRepository, 'REJECT')).resolves.toMatchObject({
        status: 'REJECTED',
      });
      expect(membershipRepository.getByGroupId).not.toHaveBeenCalled();
    });

    it('招待がない場合は人数を確認する前に INVITATION_NOT_FOUND になる', async () => {
      const membershipRepository = createRepository(createAcceptedMembers(5));
      (membershipRepository.getById as jest.Mock).mockResolvedValue(null);

      await expect(respond(membershipRepository, 'ACCEPT')).rejects.toThrow(
        ERROR_MESSAGES.INVITATION_NOT_FOUND
      );
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

    await leaveGroup(
      { groupId: 'group-1', userId: 'user-2' },
      { groupRepository, membershipRepository }
    );
    expect(membershipRepository.delete).toHaveBeenCalledWith('group-1', 'user-2');

    await expect(
      removeMember('group-1', 'owner-1', { groupRepository, membershipRepository })
    ).rejects.toThrow(ERROR_MESSAGES.OWNER_CANNOT_BE_REMOVED);
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
          createdAt: 1767225600000,
          updatedAt: 1767225600000,
        },
        {
          listId: 'group-list-2',
          groupId: 'group-1',
          name: '共有リスト2',
          createdBy: 'owner-1',
          createdAt: 1767225600000,
          updatedAt: 1767225600000,
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

  describe('リポジトリの不在エラーの変換', () => {
    const groupRepository: GroupRepository = {
      getById: jest.fn(),
      batchGetByIds: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const createMembershipRepository = (
      overrides: Partial<MembershipRepository>
    ): MembershipRepository => ({
      getById: jest.fn(),
      getByGroupId: jest.fn(),
      getByUserId: jest.fn(),
      getPendingInvitationsByUserId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByGroupId: jest.fn(),
      ...overrides,
    });
    const notFound = (): EntityNotFoundError =>
      new EntityNotFoundError('GroupMembership', 'group-1/user-2');

    it('招待の作成中に同じ相手への招待が先に作られていたら DUPLICATE_INVITATION になる', async () => {
      const membershipRepository = createMembershipRepository({
        getById: jest.fn().mockResolvedValue(null),
        getByGroupId: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockRejectedValue(new EntityAlreadyExistsError('GroupMembership', 'group-1/user-2')),
      });

      await expect(
        inviteMember(
          { groupId: 'group-1', userId: 'user-2', invitedBy: 'owner-1', invitedAt: JAN_1 },
          { groupRepository, membershipRepository }
        )
      ).rejects.toThrow(ERROR_MESSAGES.DUPLICATE_INVITATION);
    });

    it('招待の作成で重複以外のエラーはそのまま投げる', async () => {
      const failure = new Error('DynamoDB の障害');
      const membershipRepository = createMembershipRepository({
        getById: jest.fn().mockResolvedValue(null),
        getByGroupId: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockRejectedValue(failure),
      });

      await expect(
        inviteMember(
          { groupId: 'group-1', userId: 'user-2', invitedBy: 'owner-1', invitedAt: JAN_1 },
          { groupRepository, membershipRepository }
        )
      ).rejects.toBe(failure);
    });

    it('招待の応答中に招待が消えていたら INVITATION_NOT_FOUND になる', async () => {
      const membershipRepository = createMembershipRepository({
        getById: jest.fn().mockResolvedValue(createMembership({ status: 'PENDING' })),
        update: jest.fn().mockRejectedValue(notFound()),
      });

      await expect(
        respondToInvitation(
          { groupId: 'group-1', userId: 'user-1', response: 'REJECT', respondedAt: JAN_2 },
          { groupRepository, membershipRepository }
        )
      ).rejects.toThrow(ERROR_MESSAGES.INVITATION_NOT_FOUND);
    });

    it('脱退中にメンバーシップが消えていたら MEMBERSHIP_NOT_FOUND になる', async () => {
      const membershipRepository = createMembershipRepository({
        getById: jest.fn().mockResolvedValue(createMembership()),
        delete: jest.fn().mockRejectedValue(notFound()),
      });

      await expect(
        leaveGroup(
          { groupId: 'group-1', userId: 'user-1' },
          { groupRepository, membershipRepository }
        )
      ).rejects.toThrow(ERROR_MESSAGES.MEMBERSHIP_NOT_FOUND);
    });

    it('除外中にメンバーシップが消えていたら MEMBERSHIP_NOT_FOUND になる', async () => {
      const membershipRepository = createMembershipRepository({
        getById: jest.fn().mockResolvedValue(createMembership()),
        delete: jest.fn().mockRejectedValue(notFound()),
      });

      await expect(
        removeMember('group-1', 'user-1', { groupRepository, membershipRepository })
      ).rejects.toThrow(ERROR_MESSAGES.MEMBERSHIP_NOT_FOUND);
    });

    it('不在以外のエラーは変換せずそのまま投げる', async () => {
      const failure = new Error('接続エラー');
      const membershipRepository = createMembershipRepository({
        getById: jest.fn().mockResolvedValue(createMembership({ status: 'PENDING' })),
        getByGroupId: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockRejectedValue(failure),
        delete: jest.fn().mockRejectedValue(failure),
      });
      const dependencies = { groupRepository, membershipRepository };

      await expect(
        respondToInvitation(
          { groupId: 'group-1', userId: 'user-1', response: 'ACCEPT', respondedAt: JAN_2 },
          dependencies
        )
      ).rejects.toBe(failure);
      await expect(leaveGroup({ groupId: 'group-1', userId: 'user-1' }, dependencies)).rejects.toBe(
        failure
      );
      await expect(removeMember('group-1', 'user-1', dependencies)).rejects.toBe(failure);
    });
  });

  it('拒否済みユーザーの再招待では応答日時を消し、有効期限を付け直す', async () => {
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
        .mockResolvedValue(createMembership({ status: 'REJECTED', userId: 'user-2' })),
      getByGroupId: jest.fn().mockResolvedValue([]),
      getByUserId: jest.fn(),
      getPendingInvitationsByUserId: jest.fn(),
      create: jest.fn(),
      update: jest
        .fn()
        .mockResolvedValue(createMembership({ status: 'PENDING', userId: 'user-2' })),
      delete: jest.fn(),
      deleteByGroupId: jest.fn(),
    };

    await inviteMember(
      { groupId: 'group-1', userId: 'user-2', invitedBy: 'owner-1', invitedAt: JAN_1 },
      { groupRepository, membershipRepository }
    );

    expect(membershipRepository.create).not.toHaveBeenCalled();
    expect(membershipRepository.update).toHaveBeenCalledWith('group-1', 'user-2', {
      status: 'PENDING',
      invitedBy: 'owner-1',
      invitedAt: JAN_1,
      respondedAt: null,
      expiresAt: JAN_2,
    });
  });
});
