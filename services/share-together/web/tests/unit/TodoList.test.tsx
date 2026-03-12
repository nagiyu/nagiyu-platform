import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TodoList } from '@/components/TodoList';

describe('TodoList', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: originalFetch,
    });
    Object.defineProperty(window, 'fetch', {
      writable: true,
      value: originalFetch,
    });
  });

  it('ローディング中は空表示で、取得後に API の ToDo を表示する', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchMock = jest.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });
    Object.defineProperty(window, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(<TodoList listId="api-list" />);

    expect(screen.getByRole('heading', { name: 'ToDo' })).toBeInTheDocument();
    expect(screen.queryByText('牛乳を買う')).not.toBeInTheDocument();
    expect(screen.queryByText('API ToDo')).not.toBeInTheDocument();

    resolveFetch?.({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          todos: [{ todoId: 'api-todo-1', title: 'API ToDo', isCompleted: false }],
        },
      }),
    } as Response);

    await waitFor(() => {
      expect(screen.getByText('API ToDo')).toBeInTheDocument();
    });
  });

  it('ToDo 一覧を API から取得する', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          todos: [{ todoId: 'api-todo-1', title: 'API ToDo', isCompleted: false }],
        },
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });
    Object.defineProperty(window, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(<TodoList listId="api-list" />);

    await waitFor(() => {
      expect(screen.getByText('API ToDo')).toBeInTheDocument();
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/lists/api-list/todos');
  });

  it('scope=group の場合はグループ ToDo API から取得する', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          todos: [{ todoId: 'group-todo-1', title: 'グループAPI ToDo', isCompleted: false }],
        },
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });
    Object.defineProperty(window, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(<TodoList scope="group" groupId="group-1" listId="list-1" />);

    await waitFor(() => {
      expect(screen.getByText('グループAPI ToDo')).toBeInTheDocument();
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/groups/group-1/lists/list-1/todos');
  });

  it('scope=group かつ groupId 未指定の場合は API 呼び出しを行わない', () => {
    const fetchMock = jest.fn();
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });
    Object.defineProperty(window, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(<TodoList scope="group" listId="list-1" />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('listId 未指定の場合は API 呼び出しを行わない', () => {
    const fetchMock = jest.fn();
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });
    Object.defineProperty(window, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(<TodoList />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ToDo 追加時に API を呼び出す', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            todos: [],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            todoId: 'api-todo-2',
            title: 'APIで追加したToDo',
            isCompleted: false,
          },
        }),
      } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });
    Object.defineProperty(window, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(<TodoList listId="api-list" />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/lists/api-list/todos');
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'タイトル' }), {
      target: { value: 'APIで追加したToDo' },
    });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/lists/api-list/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'APIで追加したToDo' }),
      });
    });
    expect(screen.getByText('APIで追加したToDo')).toBeInTheDocument();
  });

  it('ToDo 削除成功後に一覧へ反映する', async () => {
    let resolveDeleteRequest: ((value: Response) => void) | undefined;
    const deleteRequestPromise = new Promise<Response>((resolve) => {
      resolveDeleteRequest = resolve;
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            todos: [
              { todoId: 'api-todo-1', title: 'API ToDo 1', isCompleted: false },
              { todoId: 'api-todo-2', title: 'API ToDo 2', isCompleted: false },
            ],
          },
        }),
      } as Response)
      .mockImplementationOnce(() => deleteRequestPromise)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            todos: [{ todoId: 'api-todo-2', title: 'API ToDo 2', isCompleted: false }],
          },
        }),
      } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });
    Object.defineProperty(window, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(<TodoList listId="api-list" />);

    await waitFor(() => {
      expect(screen.getByText('API ToDo 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: '削除' })[0]);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }));

    resolveDeleteRequest?.({ ok: true, status: 204 } as Response);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/lists/api-list/todos/api-todo-1', {
        method: 'DELETE',
      });
    });
    await waitFor(() => {
      expect(screen.queryByText('API ToDo 1')).not.toBeInTheDocument();
    });
    expect(screen.getByText('API ToDo 2')).toBeInTheDocument();
  });

  it('ToDo 編集時に API を呼び出す', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            todos: [{ todoId: 'api-todo-1', title: '編集前タイトル', isCompleted: false }],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            todoId: 'api-todo-1',
            title: '編集後タイトル',
            isCompleted: false,
          },
        }),
      } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });
    Object.defineProperty(window, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(<TodoList listId="api-list" />);

    await waitFor(() => {
      expect(screen.getByText('編集前タイトル')).toBeInTheDocument();
    });

    const todoRow = screen.getByText('編集前タイトル').closest('li');
    expect(todoRow).not.toBeNull();
    fireEvent.click(within(todoRow!).getByRole('button', { name: '編集' }));
    fireEvent.change(within(todoRow!).getByRole('textbox', { name: 'タイトルを編集' }), {
      target: { value: '編集後タイトル' },
    });
    fireEvent.click(within(todoRow!).getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/lists/api-list/todos/api-todo-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '編集後タイトル' }),
      });
    });
    await waitFor(() => {
      expect(screen.getByText('編集後タイトル')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('ToDoを更新しました。')).toBeInTheDocument();
    });
  });

  it('ToDo 削除失敗時に一覧を変更しない', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            todos: [
              { todoId: 'api-todo-1', title: 'API ToDo 1', isCompleted: false },
              { todoId: 'api-todo-2', title: 'API ToDo 2', isCompleted: false },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });
    Object.defineProperty(window, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(<TodoList listId="api-list" />);

    await waitFor(() => {
      expect(screen.getByText('API ToDo 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: '削除' })[0]);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/lists/api-list/todos/api-todo-1', {
        method: 'DELETE',
      });
    });
    expect(screen.getByText('API ToDo 1')).toBeInTheDocument();
    expect(screen.getByText('API ToDo 2')).toBeInTheDocument();
  });
});
