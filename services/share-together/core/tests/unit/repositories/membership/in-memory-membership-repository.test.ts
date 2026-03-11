import { InMemoryMembershipRepository } from '../../../../src/repositories/membership/in-memory-membership-repository.js';
import type { CreateGroupMembershipInput } from '../../../../src/types/index.js';

describe('InMemoryMembershipRepository', () => {
  let repository: InMemoryMembershipRepository;

  beforeEach(() => {
    repository = new InMemoryMembershipRepository();
  });

  const createInput = (
    overrides: Partial<CreateGroupMembershipInput> = {}
  ): CreateGroupMembershipInput => ({
    groupId: 'group-1',
    userId: 'user-1',
    role: 'MEMBER',
    status: 'PENDING',
    invitedBy: 'owner-1',
    invitedAt: '2026-01-01T00:00:00.000Z',
    ttl: 1_700_000_000,
    ...overrides,
  });

  it('メンバーシップを作成して複数キーで取得できる', async () => {
    const createdMembership = await repository.create(createInput());

    await expect(repository.getById('group-1', 'user-1')).resolves.toEqual(createdMembership);
    await expect(repository.getByGroupId('group-1')).resolves.toEqual([createdMembership]);
    await expect(repository.getByUserId('user-1')).resolves.toEqual([createdMembership]);
  });

  it('保留中招待のみ取得できる', async () => {
    const pendingMembership = await repository.create(
      createInput({ userId: 'user-1', status: 'PENDING' })
    );
    await repository.create(
      createInput({ userId: 'user-1', groupId: 'group-2', status: 'ACCEPTED' })
    );
    await repository.create(
      createInput({ userId: 'user-2', groupId: 'group-3', status: 'PENDING' })
    );

    await expect(repository.getPendingInvitationsByUserId('user-1')).resolves.toEqual([
      pendingMembership,
    ]);
  });

  it('メンバーシップを更新できる', async () => {
    await repository.create(createInput());

    const updatedMembership = await repository.update('group-1', 'user-1', {
      status: 'ACCEPTED',
      respondedAt: '2026-01-01T01:00:00.000Z',
      ttl: undefined,
    });

    expect(updatedMembership.status).toBe('ACCEPTED');
    expect(updatedMembership.respondedAt).toBe('2026-01-01T01:00:00.000Z');
    expect(updatedMembership.ttl).toBeUndefined();
  });

  it('存在しないメンバーシップを更新するとエラーになる', async () => {
    await expect(repository.update('group-1', 'user-1', { status: 'ACCEPTED' })).rejects.toThrow(
      'メンバーシップが見つかりません'
    );
  });

  it('重複したメンバーシップを作成するとエラーになる', async () => {
    await repository.create(createInput());

    await expect(repository.create(createInput())).rejects.toThrow(
      'メンバーシップは既に存在します'
    );
  });

  it('groupId指定削除で対象グループのメンバーシップのみ削除できる', async () => {
    await repository.create(createInput({ groupId: 'group-1', userId: 'user-1' }));
    await repository.create(createInput({ groupId: 'group-1', userId: 'user-2' }));
    const remainingMembership = await repository.create(
      createInput({ groupId: 'group-2', userId: 'user-3' })
    );

    await repository.deleteByGroupId('group-1');

    await expect(repository.getByGroupId('group-1')).resolves.toEqual([]);
    await expect(repository.getByGroupId('group-2')).resolves.toEqual([remainingMembership]);
  });

  it('メンバーシップを削除できる', async () => {
    await repository.create(createInput({ groupId: 'group-1', userId: 'user-1' }));

    await repository.delete('group-1', 'user-1');

    await expect(repository.getById('group-1', 'user-1')).resolves.toBeNull();
    await expect(repository.getByGroupId('group-1')).resolves.toEqual([]);
    await expect(repository.getByUserId('user-1')).resolves.toEqual([]);
  });
});
