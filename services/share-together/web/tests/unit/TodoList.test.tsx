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
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/lists/api-list/todos',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
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
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/groups/group-1/lists/list-1/todos',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
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
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/lists/api-list/todos',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
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
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'タイトル' })).toHaveValue('');
    });
  });

  it('ToDo 追加失敗時は Snackbar で通知し、入力を残す', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { todos: [] } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
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
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const input = screen.getByRole('textbox', { name: 'タイトル' });
    fireEvent.change(input, { target: { value: '失敗するToDo' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));

    await waitFor(() => {
      expect(screen.getByText('ToDoの追加に失敗しました。')).toBeInTheDocument();
    });
    expect(input).toHaveValue('失敗するToDo');
    consoleErrorSpy.mockRestore();
  });

  it('ネットワークエラーで ToDo 追加に失敗した場合も入力を残す', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { todos: [] } }),
      } as Response)
      .mockRejectedValueOnce(new Error('network'));
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
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const input = screen.getByRole('textbox', { name: 'タイトル' });
    fireEvent.change(input, { target: { value: '通信失敗ToDo' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));

    await waitFor(() => {
      expect(screen.getByText('ToDoの追加に失敗しました。')).toBeInTheDocument();
    });
    expect(input).toHaveValue('通信失敗ToDo');
    consoleErrorSpy.mockRestore();
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

  describe('操作失敗時の通知', () => {
    const mockFetch = (fetchMock: jest.Mock) => {
      Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
      Object.defineProperty(window, 'fetch', { writable: true, value: fetchMock });
    };
    const listResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: { todos: [{ todoId: 'api-todo-1', title: 'API ToDo 1', isCompleted: false }] },
      }),
    } as Response;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('完了切り替えが失敗したときは Snackbar で通知し、チェック状態を変えない', async () => {
      mockFetch(
        jest
          .fn()
          .mockResolvedValueOnce(listResponse)
          .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      );

      render(<TodoList listId="api-list" />);
      await waitFor(() => {
        expect(screen.getByText('API ToDo 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('checkbox', { name: 'API ToDo 1の完了チェック' }));

      await waitFor(() => {
        expect(screen.getByText('ToDoの更新に失敗しました。')).toBeInTheDocument();
      });
      expect(screen.getByRole('checkbox', { name: 'API ToDo 1の完了チェック' })).not.toBeChecked();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('編集が失敗したときは Snackbar で通知し、編集欄と入力を残す', async () => {
      mockFetch(
        jest
          .fn()
          .mockResolvedValueOnce(listResponse)
          .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      );

      render(<TodoList listId="api-list" />);
      await waitFor(() => {
        expect(screen.getByText('API ToDo 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: '編集' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'タイトルを編集' }), {
        target: { value: '失敗する編集' },
      });
      fireEvent.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(screen.getByText('ToDoの更新に失敗しました。')).toBeInTheDocument();
      });
      expect(screen.getByRole('textbox', { name: 'タイトルを編集' })).toHaveValue('失敗する編集');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('ネットワークエラーで編集が失敗した場合も編集欄と入力を残す', async () => {
      mockFetch(
        jest.fn().mockResolvedValueOnce(listResponse).mockRejectedValueOnce(new Error('network'))
      );

      render(<TodoList listId="api-list" />);
      await waitFor(() => {
        expect(screen.getByText('API ToDo 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: '編集' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'タイトルを編集' }), {
        target: { value: '通信失敗の編集' },
      });
      fireEvent.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(screen.getByText('ToDoの更新に失敗しました。')).toBeInTheDocument();
      });
      expect(screen.getByRole('textbox', { name: 'タイトルを編集' })).toHaveValue('通信失敗の編集');
    });

    it('削除が失敗したときは Snackbar で通知し、ダイアログを閉じて ToDo を残す', async () => {
      mockFetch(
        jest
          .fn()
          .mockResolvedValueOnce(listResponse)
          .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      );

      render(<TodoList listId="api-list" />);
      await waitFor(() => {
        expect(screen.getByText('API ToDo 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }));

      await waitFor(() => {
        expect(screen.getByText('ToDoの削除に失敗しました。')).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(screen.getByText('API ToDo 1')).toBeInTheDocument();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('ToDo が 0 件のときの空状態', () => {
    const EMPTY_MESSAGE = 'ToDoはまだありません。';
    const mockFetch = (fetchMock: jest.Mock) => {
      Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
      Object.defineProperty(window, 'fetch', { writable: true, value: fetchMock });
    };

    it('取得が終わって 0 件だったときに案内を出す', async () => {
      mockFetch(
        jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ data: { todos: [] } }),
        } as Response)
      );

      render(<TodoList listId="api-list" />);

      expect(await screen.findByText(EMPTY_MESSAGE)).toBeInTheDocument();
    });

    it('読み込み中は出さない', () => {
      mockFetch(jest.fn().mockImplementation(() => new Promise<Response>(() => {})));

      render(<TodoList listId="api-list" />);

      expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
    });

    it('取得に失敗したときは出さない', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockFetch(jest.fn().mockResolvedValue({ ok: false, status: 500 } as Response));

      render(<TodoList listId="api-list" />);

      expect(await screen.findByText('ToDo一覧の取得に失敗しました。')).toBeInTheDocument();
      expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
      consoleErrorSpy.mockRestore();
    });

    it('ToDo があるときは出さない', async () => {
      mockFetch(
        jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            data: { todos: [{ todoId: 'api-todo-1', title: 'API ToDo', isCompleted: false }] },
          }),
        } as Response)
      );

      render(<TodoList listId="api-list" />);

      await screen.findByText('API ToDo');
      expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
    });

    it('ToDo を追加すると案内が消える', async () => {
      mockFetch(
        jest
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ data: { todos: [] } }),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            status: 201,
            json: async () => ({
              data: { todoId: 'new-todo', title: '新しいToDo', isCompleted: false },
            }),
          } as Response)
      );
      render(<TodoList listId="api-list" />);
      await screen.findByText(EMPTY_MESSAGE);

      fireEvent.change(screen.getByRole('textbox'), { target: { value: '新しいToDo' } });
      fireEvent.click(screen.getByRole('button', { name: '追加' }));

      expect(await screen.findByText('新しいToDo')).toBeInTheDocument();
      expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
    });
  });
});
