import { InMemoryGroupRepository } from '../../../../src/repositories/group/in-memory-group-repository.js';
import type { CreateGroupInput } from '../../../../src/types/index.js';

describe('InMemoryGroupRepository', () => {
  let repository: InMemoryGroupRepository;

  beforeEach(() => {
    repository = new InMemoryGroupRepository();
  });

  it('グループを作成してIDで取得できる', async () => {
    const input: CreateGroupInput = {
      groupId: 'group-1',
      name: 'テストグループ',
      ownerUserId: 'user-1',
    };

    const createdGroup = await repository.create(input);
    const groupById = await repository.getById('group-1');

    expect(createdGroup.groupId).toBe('group-1');
    expect(createdGroup.createdAt).toBe(createdGroup.updatedAt);
    expect(groupById).toEqual(createdGroup);
  });

  it('複数IDで既存グループのみ取得できる', async () => {
    await repository.create({
      groupId: 'group-1',
      name: 'グループ1',
      ownerUserId: 'user-1',
    });
    await repository.create({
      groupId: 'group-2',
      name: 'グループ2',
      ownerUserId: 'user-2',
    });

    const groups = await repository.batchGetByIds(['group-2', 'group-unknown', 'group-1']);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.groupId).toBe('group-2');
    expect(groups[1]?.groupId).toBe('group-1');
  });

  it('グループ更新時に名前と更新日時が更新される', async () => {
    await repository.create({
      groupId: 'group-1',
      name: '更新前グループ',
      ownerUserId: 'user-1',
    });

    const updatedGroup = await repository.update('group-1', {
      name: '更新後グループ',
    });

    expect(updatedGroup.name).toBe('更新後グループ');
    expect(updatedGroup.updatedAt >= updatedGroup.createdAt).toBe(true);
  });

  it('重複IDでグループ作成するとエラーになる', async () => {
    await repository.create({
      groupId: 'group-1',
      name: 'グループ1',
      ownerUserId: 'user-1',
    });

    await expect(
      repository.create({
        groupId: 'group-1',
        name: 'グループ2',
        ownerUserId: 'user-2',
      })
    ).rejects.toThrow('グループは既に存在します');
  });

  it('グループ削除時に取得できなくなる', async () => {
    await repository.create({
      groupId: 'group-1',
      name: '削除対象グループ',
      ownerUserId: 'user-1',
    });

    await repository.delete('group-1');

    await expect(repository.getById('group-1')).resolves.toBeNull();
  });
});
