import { InMemoryListRepository } from '../../../../src/repositories/list/in-memory-list-repository.js';

describe('InMemoryListRepository', () => {
  let repository: InMemoryListRepository;

  beforeEach(() => {
    repository = new InMemoryListRepository();
  });

  it('個人リストを作成してユーザーIDで取得できる', async () => {
    const createdList = await repository.createPersonalList({
      listId: 'list-1',
      userId: 'user-1',
      name: '個人リスト',
      isDefault: true,
    });

    const lists = await repository.getPersonalListsByUserId('user-1');

    expect(createdList.createdAt).toBe(createdList.updatedAt);
    expect(lists).toHaveLength(1);
    expect(lists[0]).toEqual(createdList);
  });

  it('個人リストをIDで取得できる', async () => {
    await repository.createPersonalList({
      listId: 'list-1',
      userId: 'user-1',
      name: '個人リスト',
      isDefault: false,
    });

    await expect(repository.getPersonalListById('user-1', 'list-1')).resolves.toMatchObject({
      listId: 'list-1',
      userId: 'user-1',
      name: '個人リスト',
      isDefault: false,
    });
  });

  it('存在しない個人リストIDを取得するとnullになる', async () => {
    await expect(repository.getPersonalListById('user-1', 'unknown-list')).resolves.toBeNull();
  });

  it('個人リストを更新できる', async () => {
    await repository.createPersonalList({
      listId: 'list-1',
      userId: 'user-1',
      name: '更新前',
      isDefault: false,
    });

    const updatedList = await repository.updatePersonalList('user-1', 'list-1', {
      name: '更新後',
    });

    expect(updatedList.name).toBe('更新後');
    expect(new Date(updatedList.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(updatedList.createdAt).getTime()
    );
  });

  it('存在しない個人リストを更新するとエラーになる', async () => {
    await expect(repository.updatePersonalList('user-1', 'unknown-list', { name: '更新後' })).rejects.toThrow(
      '個人リストが見つかりません'
    );
  });

  it('個人リストを削除できる', async () => {
    await repository.createPersonalList({
      listId: 'list-1',
      userId: 'user-1',
      name: '削除対象',
      isDefault: false,
    });

    await repository.deletePersonalList('user-1', 'list-1');

    await expect(repository.getPersonalListsByUserId('user-1')).resolves.toEqual([]);
  });

  it('存在しない個人リストを削除してもエラーにならない', async () => {
    await expect(repository.deletePersonalList('user-1', 'unknown-list')).resolves.toBeUndefined();
  });

  it('グループリストを作成してグループIDで取得できる', async () => {
    const createdList = await repository.createGroupList({
      listId: 'group-list-1',
      groupId: 'group-1',
      name: '共有リスト',
      createdBy: 'user-1',
    });

    const lists = await repository.getGroupListsByGroupId('group-1');

    expect(createdList.createdAt).toBe(createdList.updatedAt);
    expect(lists).toHaveLength(1);
    expect(lists[0]).toEqual(createdList);
  });

  it('グループリストをIDで取得できる', async () => {
    await repository.createGroupList({
      listId: 'group-list-1',
      groupId: 'group-1',
      name: '共有リスト',
      createdBy: 'user-1',
    });

    await expect(repository.getGroupListById('group-1', 'group-list-1')).resolves.toMatchObject({
      listId: 'group-list-1',
      groupId: 'group-1',
      name: '共有リスト',
      createdBy: 'user-1',
    });
  });

  it('存在しないグループリストIDを取得するとnullになる', async () => {
    await expect(repository.getGroupListById('group-1', 'unknown-list')).resolves.toBeNull();
  });

  it('グループリストを更新できる', async () => {
    await repository.createGroupList({
      listId: 'group-list-1',
      groupId: 'group-1',
      name: '共有リスト',
      createdBy: 'user-1',
    });

    const updated = await repository.updateGroupList('group-1', 'group-list-1', { name: '更新後共有リスト' });
    expect(updated.name).toBe('更新後共有リスト');
  });

  it('グループリストを削除できる', async () => {
    await repository.createGroupList({
      listId: 'group-list-1',
      groupId: 'group-1',
      name: '共有リスト',
      createdBy: 'user-1',
    });

    await repository.deleteGroupList('group-1', 'group-list-1');
    await expect(repository.getGroupListsByGroupId('group-1')).resolves.toEqual([]);
  });

  it('存在しないグループリストを削除してもエラーにならない', async () => {
    await expect(repository.deleteGroupList('group-1', 'unknown-list')).resolves.toBeUndefined();
  });

  it('存在しないグループリストを更新するとエラーになる', async () => {
    await expect(repository.updateGroupList('group-1', 'unknown-list', { name: '更新後' })).rejects.toThrow(
      'グループリストが見つかりません'
    );
  });
});
