import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InMemorySingleTableStore,
} from '@nagiyu/aws';
import { InMemoryTodoRepository } from '../../../../src/repositories/todo/in-memory-todo-repository.js';
import type { CreateTodoItemInput } from '../../../../src/types/index.js';

function todoInput(overrides: Partial<CreateTodoItemInput> = {}): CreateTodoItemInput {
  return {
    todoId: 'todo-1',
    listId: 'list-1',
    title: '牛乳を買う',
    isCompleted: false,
    createdBy: 'user-1',
    ...overrides,
  };
}

describe('InMemoryTodoRepository', () => {
  let repository: InMemoryTodoRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryTodoRepository(store);
  });

  it('数値ミリ秒の時刻付きで作成し、IDで取得できる', async () => {
    const before = Date.now();
    const created = await repository.create(todoInput());

    expect(created).toMatchObject(todoInput());
    expect(created).not.toHaveProperty('completedBy');
    expect(created.createdAt).toBeGreaterThanOrEqual(before);
    expect(created.updatedAt).toBeGreaterThanOrEqual(created.createdAt);
    await expect(repository.getById('list-1', 'todo-1')).resolves.toEqual(created);
  });

  it('共有ストアに保存形式の Item を書く', async () => {
    await repository.create(todoInput());

    expect(store.get('LIST#list-1', 'TODO#todo-1')).toMatchObject({
      Type: 'TodoItem',
      TodoID: 'todo-1',
      ListID: 'list-1',
      Title: '牛乳を買う',
      IsCompleted: false,
      CreatedBy: 'user-1',
    });
  });

  it('同じ ID を作成すると EntityAlreadyExistsError をスローする', async () => {
    await repository.create(todoInput());
    await expect(repository.create(todoInput())).rejects.toThrow(EntityAlreadyExistsError);
  });

  it('存在しない ID は null を返す', async () => {
    await expect(repository.getById('list-1', 'none')).resolves.toBeNull();
  });

  it('一覧はそのリストの ToDo だけを SK (ToDo ID) 順で返す', async () => {
    await repository.create(todoInput({ todoId: 'todo-b' }));
    await repository.create(todoInput({ todoId: 'todo-a' }));
    await repository.create(todoInput({ todoId: 'todo-x', listId: 'list-2' }));

    const todos = await repository.getByListId('list-1');

    expect(todos.map((todo) => todo.todoId)).toEqual(['todo-a', 'todo-b']);
  });

  it('一覧は既定の件数上限を超えても全件返す', async () => {
    for (let index = 0; index < 120; index++) {
      await repository.create(todoInput({ todoId: `todo-${String(index).padStart(3, '0')}` }));
    }

    await expect(repository.getByListId('list-1')).resolves.toHaveLength(120);
  });

  it('ToDoのないリストの一覧は空配列を返す', async () => {
    await expect(repository.getByListId('list-none')).resolves.toEqual([]);
  });

  it('更新で指定した項目だけを変え、updatedAt を進める', async () => {
    const created = await repository.create(todoInput());

    const updated = await repository.update('list-1', 'todo-1', {
      title: '卵を買う',
      isCompleted: true,
      completedBy: 'user-2',
    });

    expect(updated).toMatchObject({
      title: '卵を買う',
      isCompleted: true,
      completedBy: 'user-2',
      createdBy: 'user-1',
      createdAt: created.createdAt,
    });
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    await expect(repository.getById('list-1', 'todo-1')).resolves.toEqual(updated);
  });

  it('completedBy に null を渡すと完了者が消え、undefined なら残る', async () => {
    await repository.create(todoInput());
    await repository.update('list-1', 'todo-1', { isCompleted: true, completedBy: 'user-2' });

    const untouched = await repository.update('list-1', 'todo-1', { title: '変更' });
    expect(untouched.completedBy).toBe('user-2');

    const reopened = await repository.update('list-1', 'todo-1', {
      isCompleted: false,
      completedBy: null,
    });
    expect(reopened.isCompleted).toBe(false);
    expect(reopened).not.toHaveProperty('completedBy');
    expect(store.get('LIST#list-1', 'TODO#todo-1')).not.toHaveProperty('CompletedBy');
  });

  it('存在しない ToDo の更新は EntityNotFoundError をスローする', async () => {
    await expect(repository.update('list-1', 'none', { title: 't' })).rejects.toThrow(
      EntityNotFoundError
    );
  });

  it('削除すると取得できなくなる', async () => {
    await repository.create(todoInput());

    await repository.delete('list-1', 'todo-1');

    await expect(repository.getById('list-1', 'todo-1')).resolves.toBeNull();
  });

  it('存在しない ToDo の削除は EntityNotFoundError をスローする', async () => {
    await expect(repository.delete('list-1', 'none')).rejects.toThrow(EntityNotFoundError);
  });

  describe('deleteByListId', () => {
    it('そのリストの ToDo だけを削除する', async () => {
      await repository.create(todoInput({ todoId: 'todo-1' }));
      await repository.create(todoInput({ todoId: 'todo-2' }));
      await repository.create(todoInput({ todoId: 'todo-3', listId: 'list-2' }));

      await repository.deleteByListId('list-1');

      await expect(repository.getByListId('list-1')).resolves.toEqual([]);
      await expect(repository.getByListId('list-2')).resolves.toHaveLength(1);
    });

    it('ToDo がなくても成功する (冪等)', async () => {
      await expect(repository.deleteByListId('list-none')).resolves.toBeUndefined();
    });

    it('同じ PK の別種別のアイテムは消さない', async () => {
      store.put({ PK: 'LIST#list-1', SK: 'OTHER#1', Type: 'Other', CreatedAt: 1, UpdatedAt: 1 });
      await repository.create(todoInput());

      await repository.deleteByListId('list-1');

      expect(store.get('LIST#list-1', 'OTHER#1')).toBeDefined();
    });
  });
});
