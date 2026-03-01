import type { TodoRepository } from '../../../src/repositories/todo/todo-repository.interface.js';

describe('todo business logic', () => {
  const TODO_MODULE_PATH = '../../../src/libs/todo.js';

  it.skip('ToDo を作成できる', async () => {
    const { createTodo } = await import(TODO_MODULE_PATH);
    const repository = {
      create: jest.fn(),
    } as unknown as TodoRepository;

    await createTodo(repository, {
      listId: 'list-1',
      title: '牛乳を買う',
      createdBy: 'user-1',
    });

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        listId: 'list-1',
        title: '牛乳を買う',
        isCompleted: false,
        createdBy: 'user-1',
        completedBy: undefined,
      })
    );
  });

  it.skip('タイトルが空文字の場合は ToDo 作成でエラーになる', async () => {
    const { createTodo } = await import(TODO_MODULE_PATH);
    const repository = {
      create: jest.fn(),
    } as unknown as TodoRepository;

    await expect(
      createTodo(repository, {
        listId: 'list-1',
        title: '',
        createdBy: 'user-1',
      })
    ).rejects.toBeInstanceOf(Error);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.skip('ToDo タイトルを更新できる', async () => {
    const { updateTodo } = await import(TODO_MODULE_PATH);
    const repository = {
      update: jest.fn().mockResolvedValue({
        todoId: 'todo-1',
        listId: 'list-1',
        title: '新しいタイトル',
        isCompleted: false,
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T01:00:00.000Z',
      }),
    } as unknown as TodoRepository;

    await updateTodo(repository, 'list-1', 'todo-1', {
      title: '新しいタイトル',
    });

    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(repository.update).toHaveBeenCalledWith('list-1', 'todo-1', {
      title: '新しいタイトル',
    });
  });

  it.skip('ToDo 完了状態を更新できる', async () => {
    const { updateTodo } = await import(TODO_MODULE_PATH);
    const repository = {
      update: jest.fn(),
    } as unknown as TodoRepository;

    await updateTodo(repository, 'list-1', 'todo-1', {
      isCompleted: true,
      completedBy: 'user-1',
    });

    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(repository.update).toHaveBeenCalledWith('list-1', 'todo-1', {
      isCompleted: true,
      completedBy: 'user-1',
    });
  });

  it.skip('ToDo を削除できる', async () => {
    const { deleteTodo } = await import(TODO_MODULE_PATH);
    const repository = {
      delete: jest.fn(),
    } as unknown as TodoRepository;

    await deleteTodo(repository, 'list-1', 'todo-1');

    expect(repository.delete).toHaveBeenCalledTimes(1);
    expect(repository.delete).toHaveBeenCalledWith('list-1', 'todo-1');
  });
});
