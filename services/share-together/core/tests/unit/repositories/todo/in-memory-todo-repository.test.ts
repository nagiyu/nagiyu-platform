import { InMemoryTodoRepository } from '../../../../src/repositories/todo/in-memory-todo-repository.js';
import type { CreateTodoItemInput } from '../../../../src/types/index.js';

describe('InMemoryTodoRepository', () => {
  let repository: InMemoryTodoRepository;

  beforeEach(() => {
    repository = new InMemoryTodoRepository();
  });

  it('ToDoを作成してリストID・ToDo IDで取得できる', async () => {
    const input: CreateTodoItemInput = {
      todoId: 'todo-1',
      listId: 'list-1',
      title: '牛乳を買う',
      isCompleted: false,
      createdBy: 'user-1',
    };

    const createdTodo = await repository.create(input);
    const todos = await repository.getByListId('list-1');
    const todoById = await repository.getById('list-1', 'todo-1');

    expect(createdTodo.todoId).toBe('todo-1');
    expect(createdTodo.createdAt).toBe(createdTodo.updatedAt);
    expect(todos).toEqual([createdTodo]);
    expect(todoById).toEqual(createdTodo);
  });

  it('ToDo更新時に変更が保存される', async () => {
    await repository.create({
      todoId: 'todo-1',
      listId: 'list-1',
      title: '更新前',
      isCompleted: false,
      createdBy: 'user-1',
    });

    const updatedTodo = await repository.update('list-1', 'todo-1', {
      title: '更新後',
      isCompleted: true,
      completedBy: 'user-2',
    });

    expect(updatedTodo.title).toBe('更新後');
    expect(updatedTodo.isCompleted).toBe(true);
    expect(updatedTodo.completedBy).toBe('user-2');
  });

  it('同一リスト内で重複ToDo IDを作成するとエラーになる', async () => {
    await repository.create({
      todoId: 'todo-1',
      listId: 'list-1',
      title: '重複チェック',
      isCompleted: false,
      createdBy: 'user-1',
    });

    await expect(
      repository.create({
        todoId: 'todo-1',
        listId: 'list-1',
        title: '重複チェック2',
        isCompleted: false,
        createdBy: 'user-1',
      })
    ).rejects.toThrow('ToDoは既に存在します');
  });

  it('リスト単位でToDoを削除できる', async () => {
    await repository.create({
      todoId: 'todo-1',
      listId: 'list-1',
      title: 'list-1のToDo',
      isCompleted: false,
      createdBy: 'user-1',
    });
    await repository.create({
      todoId: 'todo-2',
      listId: 'list-2',
      title: 'list-2のToDo',
      isCompleted: false,
      createdBy: 'user-1',
    });

    await repository.deleteByListId('list-1');

    await expect(repository.getByListId('list-1')).resolves.toEqual([]);
    await expect(repository.getById('list-2', 'todo-2')).resolves.not.toBeNull();
  });
});
