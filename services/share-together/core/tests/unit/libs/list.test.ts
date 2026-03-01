import type { ListRepository } from '../../../../src/repositories/list/list-repository.interface.js';
import type { TodoRepository } from '../../../../src/repositories/todo/todo-repository.interface.js';
import type { PersonalList } from '../../../../src/types/index.js';
import {
  getPersonalLists,
  createPersonalList,
  updatePersonalList,
  deletePersonalList,
  ERROR_MESSAGES,
} from '../../../../src/libs/list.js';

describe('list libs', () => {
  let listRepository: jest.Mocked<ListRepository>;
  let todoRepository: jest.Mocked<TodoRepository>;

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
  });

  it('ユーザーIDで個人リスト一覧を取得できる', async () => {
    const expectedLists: PersonalList[] = [
      {
        listId: 'list-1',
        userId: 'user-1',
        name: 'デフォルトリスト',
        isDefault: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    listRepository.getPersonalListsByUserId.mockResolvedValueOnce(expectedLists);

    const result = await getPersonalLists(listRepository, 'user-1');

    expect(result).toEqual(expectedLists);
    expect(listRepository.getPersonalListsByUserId).toHaveBeenCalledWith('user-1');
  });

  it('個人リストを作成できる', async () => {
    const now = '2026-01-01T00:00:00.000Z';
    const createdList: PersonalList = {
      listId: 'list-2',
      userId: 'user-1',
      name: '買い物リスト',
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    listRepository.createPersonalList.mockResolvedValueOnce(createdList);

    const result = await createPersonalList(listRepository, {
      listId: 'list-2',
      userId: 'user-1',
      name: '買い物リスト',
      isDefault: false,
    });

    expect(result).toEqual(createdList);
    expect(listRepository.createPersonalList).toHaveBeenCalledWith({
      listId: 'list-2',
      userId: 'user-1',
      name: '買い物リスト',
      isDefault: false,
    });
  });

  it('個人リスト名を更新できる', async () => {
    const updatedList: PersonalList = {
      listId: 'list-2',
      userId: 'user-1',
      name: '更新後リスト',
      isDefault: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    listRepository.updatePersonalList.mockResolvedValueOnce(updatedList);

    const result = await updatePersonalList(listRepository, 'user-1', 'list-2', {
      name: '更新後リスト',
    });

    expect(result).toEqual(updatedList);
    expect(listRepository.updatePersonalList).toHaveBeenCalledWith('user-1', 'list-2', {
      name: '更新後リスト',
    });
  });

  it('デフォルト個人リストは削除できない', async () => {
    listRepository.getPersonalListById.mockResolvedValueOnce({
      listId: 'list-default',
      userId: 'user-1',
      name: 'デフォルトリスト',
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(
      deletePersonalList(listRepository, todoRepository, 'user-1', 'list-default')
    ).rejects.toThrow(ERROR_MESSAGES.DEFAULT_LIST_NOT_DELETABLE);
    expect(todoRepository.deleteByListId).not.toHaveBeenCalled();
    expect(listRepository.deletePersonalList).not.toHaveBeenCalled();
  });

  it('デフォルト以外の個人リスト削除時はリスト内ToDoも削除される', async () => {
    listRepository.getPersonalListById.mockResolvedValueOnce({
      listId: 'list-2',
      userId: 'user-1',
      name: '買い物リスト',
      isDefault: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await deletePersonalList(listRepository, todoRepository, 'user-1', 'list-2');

    expect(todoRepository.deleteByListId).toHaveBeenCalledWith('list-2');
    expect(listRepository.deletePersonalList).toHaveBeenCalledWith('user-1', 'list-2');
  });
});
