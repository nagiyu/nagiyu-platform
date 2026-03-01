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
});
