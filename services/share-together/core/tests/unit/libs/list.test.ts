import { EntityNotFoundError, InMemorySingleTableStore } from '@nagiyu/aws';
import { InvalidInputError } from '@nagiyu/common';
import { LIST_ERROR_MESSAGES, ListService } from '../../../src/libs/list.js';
import { InMemoryListRepository } from '../../../src/repositories/list/in-memory-list-repository.js';
import type { ListRepository } from '../../../src/repositories/list/list-repository.interface.js';
import type { TodoRepository } from '../../../src/repositories/todo/todo-repository.interface.js';
import type { PersonalList } from '../../../src/types/index.js';

describe('ListService', () => {
  let listRepository: jest.Mocked<ListRepository>;
  let todoRepository: jest.Mocked<TodoRepository>;
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
    todoRepository = {
      getByListId: jest.fn(),
      getById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByListId: jest.fn(),
    };
    listRepository.getPersonalListsByUserId.mockResolvedValue([]);
    listService = new ListService(listRepository, todoRepository);
  });

  it('個人リスト作成時に名前をトリムして保存する', async () => {
    listRepository.createPersonalList.mockImplementation(async (input) => {
      return {
        ...input,
        createdAt: 1767225600000,
        updatedAt: 1767225600000,
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

  it('リスト名が空文字の場合は InvalidInputError になる', async () => {
    const action = listService.createPersonalList('user-1', '   ');

    await expect(action).rejects.toBeInstanceOf(InvalidInputError);
    await expect(action).rejects.toThrow('リスト名は1〜100文字で入力してください');
    expect(listRepository.createPersonalList).not.toHaveBeenCalled();
  });

  it('リスト名が101文字の場合は InvalidInputError になる', async () => {
    const action = listService.createPersonalList('user-1', 'あ'.repeat(101));

    await expect(action).rejects.toBeInstanceOf(InvalidInputError);
    await expect(action).rejects.toThrow('リスト名は1〜100文字で入力してください');
    expect(listRepository.createPersonalList).not.toHaveBeenCalled();
  });

  it('個人リストが100件ある場合は新規作成できない', async () => {
    listRepository.getPersonalListsByUserId.mockResolvedValue(
      Array.from({ length: 100 }, (_, index) => ({
        listId: `list-${index + 1}`,
        userId: 'user-1',
        name: `リスト${index + 1}`,
        isDefault: index === 0,
        createdAt: 1767225600000,
        updatedAt: 1767225600000,
      }))
    );

    const action = listService.createPersonalList('user-1', '新規リスト');

    await expect(action).rejects.toThrow(LIST_ERROR_MESSAGES.PERSONAL_LIST_LIMIT_EXCEEDED);
    await expect(action).rejects.not.toBeInstanceOf(InvalidInputError);
    expect(listRepository.createPersonalList).not.toHaveBeenCalled();
  });

  it('個人リスト一覧を取得できる', async () => {
    const lists: PersonalList[] = [
      {
        listId: 'list-1',
        userId: 'user-1',
        name: 'デフォルト',
        isDefault: true,
        createdAt: 1767225600000,
        updatedAt: 1767225600000,
      },
    ];
    listRepository.getPersonalListsByUserId.mockResolvedValue(lists);

    await expect(listService.getPersonalListsByUserId('user-1')).resolves.toEqual(lists);
  });

  it('ユーザーIDが空文字の場合はバリデーションエラーになる', async () => {
    const action = listService.getPersonalListsByUserId('   ');

    await expect(action).rejects.toBeInstanceOf(InvalidInputError);
    await expect(action).rejects.toThrow('ユーザーIDは必須です');
    expect(listRepository.getPersonalListsByUserId).not.toHaveBeenCalled();
  });

  it('個人リストIDで詳細を取得できる', async () => {
    const list: PersonalList = {
      listId: 'list-1',
      userId: 'user-1',
      name: 'デフォルト',
      isDefault: true,
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    };
    listRepository.getPersonalListById.mockResolvedValue(list);

    await expect(listService.getPersonalListById('user-1', 'list-1')).resolves.toEqual(list);
  });

  it('存在しない個人リストIDを取得すると EntityNotFoundError になる', async () => {
    listRepository.getPersonalListById.mockResolvedValue(null);

    const action = listService.getPersonalListById('user-1', 'list-404');

    await expect(action).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(action).rejects.toThrow('PersonalList=USER#user-1#PLIST#list-404');
  });

  it('デフォルトリストは削除できない', async () => {
    listRepository.getPersonalListById.mockResolvedValue({
      listId: 'list-1',
      userId: 'user-1',
      name: 'デフォルト',
      isDefault: true,
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });

    const action = listService.deletePersonalList('user-1', 'list-1');

    await expect(action).rejects.toThrow(LIST_ERROR_MESSAGES.DEFAULT_LIST_NOT_DELETABLE);
    await expect(action).rejects.not.toBeInstanceOf(InvalidInputError);
    expect(listRepository.deletePersonalList).not.toHaveBeenCalled();
    expect(todoRepository.deleteByListId).not.toHaveBeenCalled();
  });

  it('存在しないリスト更新の EntityNotFoundError はそのまま送出する', async () => {
    const notFound = new EntityNotFoundError('PersonalList', 'user-1/list-404');
    listRepository.updatePersonalList.mockRejectedValue(notFound);

    await expect(listService.updatePersonalList('user-1', 'list-404', '更新名')).rejects.toBe(
      notFound
    );
  });

  it('存在しないリスト削除の EntityNotFoundError はそのまま送出する', async () => {
    listRepository.getPersonalListById.mockResolvedValue({
      listId: 'list-1',
      userId: 'user-1',
      name: '買い物',
      isDefault: false,
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });
    const notFound = new EntityNotFoundError('PersonalList', 'user-1/list-404');
    listRepository.deletePersonalList.mockRejectedValue(notFound);

    await expect(listService.deletePersonalList('user-1', 'list-1')).rejects.toBe(notFound);
  });

  it('個人リスト削除時に未知のエラーはそのまま返す', async () => {
    listRepository.getPersonalListById.mockResolvedValue({
      listId: 'list-1',
      userId: 'user-1',
      name: '買い物',
      isDefault: false,
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });
    listRepository.deletePersonalList.mockRejectedValue(new Error('DBエラー'));

    await expect(listService.deletePersonalList('user-1', 'list-1')).rejects.toThrow('DBエラー');
  });

  it('個人リスト更新時に未知のエラーはそのまま返す', async () => {
    listRepository.updatePersonalList.mockRejectedValue(new Error('DBエラー'));

    await expect(listService.updatePersonalList('user-1', 'list-1', '更新名')).rejects.toThrow(
      'DBエラー'
    );
  });

  it('個人リストを削除できる', async () => {
    listRepository.getPersonalListById.mockResolvedValue({
      listId: 'list-1',
      userId: 'user-1',
      name: '買い物',
      isDefault: false,
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });

    await expect(listService.deletePersonalList('user-1', 'list-1')).resolves.toBeUndefined();
    expect(listRepository.deletePersonalList).toHaveBeenCalledWith('user-1', 'list-1');
  });

  it('個人リスト削除時に ToDo を削除してからリストを削除する', async () => {
    listRepository.getPersonalListById.mockResolvedValue({
      listId: 'list-1',
      userId: 'user-1',
      name: '買い物',
      isDefault: false,
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });

    await listService.deletePersonalList('user-1', 'list-1');

    expect(todoRepository.deleteByListId).toHaveBeenCalledTimes(1);
    expect(todoRepository.deleteByListId).toHaveBeenCalledWith('list-1');
    expect(todoRepository.deleteByListId.mock.invocationCallOrder[0]).toBeLessThan(
      listRepository.deletePersonalList.mock.invocationCallOrder[0]
    );
  });

  it('ToDo 削除に失敗した場合はリストを削除しない', async () => {
    listRepository.getPersonalListById.mockResolvedValue({
      listId: 'list-1',
      userId: 'user-1',
      name: '買い物',
      isDefault: false,
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });
    todoRepository.deleteByListId.mockRejectedValue(new Error('DBエラー'));

    await expect(listService.deletePersonalList('user-1', 'list-1')).rejects.toThrow('DBエラー');
    expect(listRepository.deletePersonalList).not.toHaveBeenCalled();
  });

  it('存在しない個人リストを削除しようとすると EntityNotFoundError になる', async () => {
    listRepository.getPersonalListById.mockResolvedValue(null);

    await expect(listService.deletePersonalList('user-1', 'list-404')).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    expect(listRepository.deletePersonalList).not.toHaveBeenCalled();
  });

  it('存在しない個人リスト削除時は ToDo も削除しない', async () => {
    listRepository.getPersonalListById.mockResolvedValue(null);

    await expect(listService.deletePersonalList('user-1', 'list-404')).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    expect(todoRepository.deleteByListId).not.toHaveBeenCalled();
  });

  it('メッセージだけが同じ素のエラーは不在にも入力不正にも変換しない', async () => {
    listRepository.updatePersonalList.mockRejectedValue(new Error('個人リストが見つかりません'));
    const action = listService.updatePersonalList('user-1', 'list-1', '更新名');

    await expect(action).rejects.toThrow('個人リストが見つかりません');
    await expect(action).rejects.not.toBeInstanceOf(EntityNotFoundError);
    await expect(action).rejects.not.toBeInstanceOf(InvalidInputError);
  });

  describe('InMemory リポジトリ経由', () => {
    let realService: ListService;
    let realListRepository: InMemoryListRepository;

    beforeEach(() => {
      realListRepository = new InMemoryListRepository(new InMemorySingleTableStore());
      realService = new ListService(realListRepository, todoRepository);
    });

    it('デフォルトリストは、リポジトリが検査しなくても ListService 経由では削除できない', async () => {
      await realListRepository.createPersonalList({
        listId: 'list-default',
        userId: 'user-1',
        name: 'デフォルト',
        isDefault: true,
      });

      await expect(realService.deletePersonalList('user-1', 'list-default')).rejects.toThrow(
        LIST_ERROR_MESSAGES.DEFAULT_LIST_NOT_DELETABLE
      );
      await expect(
        realListRepository.getPersonalListById('user-1', 'list-default')
      ).resolves.not.toBeNull();
      expect(todoRepository.deleteByListId).not.toHaveBeenCalled();
    });

    it('存在しない個人リストの更新は EntityNotFoundError になる', async () => {
      await expect(
        realService.updatePersonalList('user-1', 'list-404', '更新名')
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('通常の個人リストを削除できる', async () => {
      const created = await realService.createPersonalList('user-1', '買い物');

      await realService.deletePersonalList('user-1', created.listId);

      await expect(realService.getPersonalListsByUserId('user-1')).resolves.toEqual([]);
    });
  });
});
