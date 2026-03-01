import { ListService } from '../../../src/libs/list.js';
import type { ListRepository } from '../../../src/repositories/list/list-repository.interface.js';
import type { PersonalList } from '../../../src/types/index.js';

describe('ListService', () => {
  let listRepository: jest.Mocked<ListRepository>;
  let listService: ListService;

  beforeEach(() => {
    listRepository = {
      getPersonalListsByUserId: jest.fn(),
      getPersonalListById: jest.fn(),
      createPersonalList: jest.fn(),
      updatePersonalList: jest.fn(),
      deletePersonalList: jest.fn(),
      getGroupListsByGroupId: jest.fn(),
      getGroupListById: jest.fn(),
      createGroupList: jest.fn(),
      updateGroupList: jest.fn(),
      deleteGroupList: jest.fn(),
    };
    listService = new ListService(listRepository);
  });

  it('個人リスト作成時に名前をトリムして保存する', async () => {
    listRepository.createPersonalList.mockImplementation(async (input) => {
      return {
        ...input,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
    });

    const created = await listService.createPersonalList('user-1', '  買い物  ');

    expect(created.name).toBe('買い物');
    expect(created.isDefault).toBe(false);
    expect(listRepository.createPersonalList).toHaveBeenCalledWith({
      listId: expect.any(String),
      userId: 'user-1',
      name: '買い物',
      isDefault: false,
    });
  });

  it('リスト名が空文字の場合はバリデーションエラーになる', async () => {
    await expect(listService.createPersonalList('user-1', '   ')).rejects.toThrow(
      'リスト名は1〜100文字で入力してください'
    );
    expect(listRepository.createPersonalList).not.toHaveBeenCalled();
  });

  it('個人リスト一覧を取得できる', async () => {
    const lists: PersonalList[] = [
      {
        listId: 'list-1',
        userId: 'user-1',
        name: 'デフォルト',
        isDefault: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    listRepository.getPersonalListsByUserId.mockResolvedValue(lists);

    await expect(listService.getPersonalListsByUserId('user-1')).resolves.toEqual(lists);
  });

  it('デフォルトリストは削除できない', async () => {
    listRepository.getPersonalListById.mockResolvedValue({
      listId: 'list-1',
      userId: 'user-1',
      name: 'デフォルト',
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(listService.deletePersonalList('user-1', 'list-1')).rejects.toThrow(
      'デフォルトリストは削除できません'
    );
    expect(listRepository.deletePersonalList).not.toHaveBeenCalled();
  });

  it('存在しないリスト更新エラーを統一メッセージに変換する', async () => {
    listRepository.updatePersonalList.mockRejectedValue(
      new Error('指定された個人リストは存在しません')
    );

    await expect(listService.updatePersonalList('user-1', 'list-404', '更新名')).rejects.toThrow(
      '個人リストが見つかりません'
    );
  });
});
