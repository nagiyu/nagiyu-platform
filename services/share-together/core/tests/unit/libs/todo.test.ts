import { TodoService } from '../../../src/libs/todo.js';
import type { TodoRepository } from '../../../src/repositories/todo/todo-repository.interface.js';
import type { TodoItem } from '../../../src/types/index.js';

describe('TodoService', () => {
  let todoRepository: jest.Mocked<TodoRepository>;
  let todoService: TodoService;

  beforeEach(() => {
    todoRepository = {
      getByListId: jest.fn(),
      getById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByListId: jest.fn(),
    };
    todoService = new TodoService(todoRepository);
  });

  it('ToDo作成時にタイトルをトリムして未完了で保存する', async () => {
    todoRepository.create.mockImplementation(async (input) => {
      return {
        ...input,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
    });

    const todo = await todoService.createTodo('list-1', '  牛乳を買う  ', 'user-1');

    expect(todo.title).toBe('牛乳を買う');
    expect(todo.isCompleted).toBe(false);
    expect(todo.createdBy).toBe('user-1');
    expect(todoRepository.create).toHaveBeenCalledWith({
      todoId: expect.any(String),
      listId: 'list-1',
      title: '牛乳を買う',
      isCompleted: false,
      createdBy: 'user-1',
    });
  });

  it('ToDoタイトルが空文字の場合はバリデーションエラーになる', async () => {
    await expect(todoService.createTodo('list-1', '   ', 'user-1')).rejects.toThrow(
      'ToDoのタイトルは1〜200文字で入力してください'
    );
    expect(todoRepository.create).not.toHaveBeenCalled();
  });

  it('ToDo一覧取得時にリストIDが空白の場合はバリデーションエラーになる', async () => {
    const action = todoService.getTodosByListId('   ');

    await expect(action).rejects.toThrow('リストIDは必須です');
  });

  it('ToDo作成時にユーザーIDが空白の場合はバリデーションエラーになる', async () => {
    const action = todoService.createTodo('list-1', '有効なタイトル', '   ');

    await expect(action).rejects.toThrow('ユーザーIDは必須です');
  });

  it('ToDo更新時にToDo IDが空白の場合はバリデーションエラーになる', async () => {
    const action = todoService.updateTodo('list-1', '   ', { title: '更新後' }, 'user-1');

    await expect(action).rejects.toThrow('ToDo IDは必須です');
  });

  it('ToDo完了時は完了ユーザーIDを設定する', async () => {
    const updatedTodo: TodoItem = {
      todoId: 'todo-1',
      listId: 'list-1',
      title: '牛乳を買う',
      isCompleted: true,
      createdBy: 'user-1',
      completedBy: 'user-2',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    todoRepository.update.mockResolvedValue(updatedTodo);

    const todo = await todoService.updateTodo('list-1', 'todo-1', { isCompleted: true }, 'user-2');

    expect(todo).toEqual(updatedTodo);
    expect(todoRepository.update).toHaveBeenCalledWith('list-1', 'todo-1', {
      isCompleted: true,
      completedBy: 'user-2',
    });
  });

  it('ToDo未完了化時はcompletedByを削除する', async () => {
    todoRepository.update.mockResolvedValue({
      todoId: 'todo-1',
      listId: 'list-1',
      title: '牛乳を買う',
      isCompleted: false,
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await todoService.updateTodo('list-1', 'todo-1', { isCompleted: false }, 'user-2');

    expect(todoRepository.update).toHaveBeenCalledWith('list-1', 'todo-1', {
      isCompleted: false,
      completedBy: undefined,
    });
  });

  it('ToDo更新時に更新項目がない場合はエラーになる', async () => {
    await expect(todoService.updateTodo('list-1', 'todo-1', {}, 'user-1')).rejects.toThrow(
      '更新内容が指定されていません'
    );
    expect(todoRepository.update).not.toHaveBeenCalled();
  });

  it('存在しないToDo更新エラーを統一メッセージに変換する', async () => {
    todoRepository.update.mockRejectedValue(new Error('指定されたToDoは存在しません'));

    await expect(
      todoService.updateTodo('list-1', 'todo-404', { title: '更新後' }, 'user-1')
    ).rejects.toThrow('ToDoが見つかりません');
  });

  it('存在しないToDo以外の更新エラーはそのまま送出する', async () => {
    todoRepository.update.mockRejectedValue(new Error('更新に失敗しました'));
    const action = todoService.updateTodo('list-1', 'todo-1', { title: '更新後' }, 'user-1');

    await expect(action).rejects.toThrow('更新に失敗しました');
  });

  it('存在しないToDo削除エラーを統一メッセージに変換する', async () => {
    todoRepository.delete.mockRejectedValue(new Error('指定されたToDoは存在しません'));

    await expect(todoService.deleteTodo('list-1', 'todo-404')).rejects.toThrow(
      'ToDoが見つかりません'
    );
  });

  it('存在しないToDo以外の削除エラーはそのまま送出する', async () => {
    todoRepository.delete.mockRejectedValue(new Error('削除に失敗しました'));
    const action = todoService.deleteTodo('list-1', 'todo-1');

    await expect(action).rejects.toThrow('削除に失敗しました');
  });

  it('リストIDでToDo一覧を取得できる', async () => {
    const todos: TodoItem[] = [
      {
        todoId: 'todo-1',
        listId: 'list-1',
        title: '牛乳を買う',
        isCompleted: false,
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    todoRepository.getByListId.mockResolvedValue(todos);

    await expect(todoService.getTodosByListId('list-1')).resolves.toEqual(todos);
  });
});
