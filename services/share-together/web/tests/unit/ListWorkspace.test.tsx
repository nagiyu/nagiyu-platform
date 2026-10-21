import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ListWorkspace } from '@/components/ListWorkspace';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('ListWorkspace', () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let promptSpy: jest.SpyInstance;
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    promptSpy = jest.spyOn(window, 'prompt');
    confirmSpy = jest.spyOn(window, 'confirm');
    const fetchMock = jest
      .fn()
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        if (requestUrl === '/api/groups') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                groups: [
                  { groupId: 'group-1', name: '家族' },
                  { groupId: 'group-2', name: 'ルームメイト' },
                ],
              },
            }),
          } as Response);
        }

        if (requestUrl === '/api/groups/group-1/lists' && init?.method === 'POST') {
          const body =
            typeof init.body === 'string' ? (JSON.parse(init.body) as { name?: string }) : {};
          if (body.name === '失敗する共有リスト') {
            return Promise.resolve({
              ok: false,
              status: 400,
              json: async () => ({
                error: 'VALIDATION_ERROR',
                message: '共有リスト名が不正です',
              }),
            } as Response);
          }

          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({
              data: {
                listId: 'created-shared-list',
                groupId: 'group-1',
                name: body.name ?? '未設定',
                createdBy: 'test-user',
              },
            }),
          } as Response);
        }

        if (requestUrl === '/api/groups/group-1/lists/group-list-1' && init?.method === 'PUT') {
          const body =
            typeof init.body === 'string' ? (JSON.parse(init.body) as { name?: string }) : {};
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                listId: 'group-list-1',
                groupId: 'group-1',
                name: body.name ?? '未設定',
                createdBy: 'test-user',
              },
            }),
          } as Response);
        }

        if (requestUrl === '/api/groups/group-1/lists/group-list-1' && init?.method === 'DELETE') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({}),
          } as Response);
        }

        if (requestUrl === '/api/groups/group-1/lists') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                lists: [{ listId: 'group-list-1', name: '買い物リスト（共有）' }],
              },
            }),
          } as Response);
        }

        if (requestUrl === '/api/groups/group-2/lists') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                lists: [{ listId: 'group-list-2', name: 'ルームメイト家事分担' }],
              },
            }),
          } as Response);
        }

        if (requestUrl === '/api/groups/group-1/lists/group-list-1/todos') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                todos: [
                  { todoId: 'group-todo-1', title: '会議用の議題を共有する', isCompleted: false },
                ],
              },
            }),
          } as Response);
        }

        if (requestUrl === '/api/groups/group-2/lists/group-list-2/todos') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                todos: [
                  { todoId: 'group-todo-2', title: 'ゴミ出し当番を確認する', isCompleted: false },
                ],
              },
            }),
          } as Response);
        }

        if (requestUrl === '/api/groups/group-1/lists/created-shared-list/todos') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                todos: [],
              },
            }),
          } as Response);
        }

        if (requestUrl === '/api/lists/api-personal-list-1/todos') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                todos: [{ todoId: 'personal-todo-1', title: 'API個人ToDo', isCompleted: false }],
              },
            }),
          } as Response);
        }

        if (requestUrl === '/api/lists/mock-default-list/todos') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                todos: [
                  { todoId: 'mock-personal-todo-1', title: '個人ToDo(初期)', isCompleted: false },
                ],
              },
            }),
          } as Response);
        }

        if (requestUrl === '/api/lists/group-list-2/todos') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                todos: [],
              },
            }),
          } as Response);
        }

        if (requestUrl === '/api/lists') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                lists: [{ listId: 'api-personal-list-1', name: 'API個人リスト', isDefault: true }],
              },
            }),
          } as Response);
        }

        throw new Error(`予期しないfetch呼び出し: ${requestUrl}`);
      });
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });
    Object.defineProperty(window, 'fetch', {
      writable: true,
      value: fetchMock,
    });
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
    promptSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it('個人と共有を切り替えると共有グループと共有ToDoをAPIから表示する', async () => {
    render(<ListWorkspace initialListId="mock-default-list" />);

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });

    await waitFor(() => {
      expect(screen.getByLabelText('グループ')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('会議用の議題を共有する')).toBeInTheDocument();
    });
  });

  it('共有から個人に戻したときに個人リストのToDoを取得する', async () => {
    render(<ListWorkspace initialListId="mock-default-list" />);

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });
    await waitFor(() => {
      expect(screen.getByText('会議用の議題を共有する')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'personal' } });
    await waitFor(() => {
      expect(screen.getByText('個人ToDo(初期)')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText('ToDo一覧の取得に失敗しました。')).not.toBeInTheDocument();
    });
  });

  it('共有スコープから入って個人に切り替えると、デフォルト個人リストのToDoを取得する', async () => {
    render(
      <ListWorkspace initialScope="shared" initialGroupId="group-1" initialListId="group-list-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('会議用の議題を共有する')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'personal' } });

    await waitFor(() => {
      expect(screen.getByText('API個人ToDo')).toBeInTheDocument();
    });
    expect(screen.queryByText('会議用の議題を共有する')).not.toBeInTheDocument();
    expect(screen.queryByText('ToDo一覧の取得に失敗しました。')).not.toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/lists/api-personal-list-1/todos',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      '/api/lists/group-list-1/todos',
      expect.anything()
    );
  });

  it('共有スコープから入った場合はデフォルトリストがなければ先頭の個人リストを使う', async () => {
    const baseFetch = globalThis.fetch as jest.Mock;
    const fetchMock = jest
      .fn()
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/api/lists') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                lists: [{ listId: 'api-personal-list-1', name: 'API個人リスト', isDefault: false }],
              },
            }),
          } as Response);
        }
        return baseFetch(input, init);
      });
    Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
    Object.defineProperty(window, 'fetch', { writable: true, value: fetchMock });

    render(
      <ListWorkspace initialScope="shared" initialGroupId="group-1" initialListId="group-list-1" />
    );
    await waitFor(() => {
      expect(screen.getByText('会議用の議題を共有する')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'personal' } });
    await waitFor(() => {
      expect(screen.getByText('API個人ToDo')).toBeInTheDocument();
    });
  });

  it('個人リスト一覧の取得が未完了のまま個人に切り替えた場合、取得完了後にToDoを表示する', async () => {
    const baseFetch = globalThis.fetch as jest.Mock;
    // ListWorkspace と個人スコープのサイドバーの双方が /api/lists を取得するため、全て保留して後でまとめて解決する。
    const pendingPersonalListsResolvers: Array<(value: Response) => void> = [];
    const fetchMock = jest
      .fn()
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/api/lists') {
          return new Promise<Response>((resolve) => {
            pendingPersonalListsResolvers.push(resolve);
          });
        }
        return baseFetch(input, init);
      });
    Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
    Object.defineProperty(window, 'fetch', { writable: true, value: fetchMock });

    render(
      <ListWorkspace initialScope="shared" initialGroupId="group-1" initialListId="group-list-1" />
    );
    await waitFor(() => {
      expect(screen.getByText('会議用の議題を共有する')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'personal' } });
    expect(screen.queryByRole('heading', { name: 'ToDo' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/lists/group-list-1/todos', expect.anything());

    pendingPersonalListsResolvers.forEach((resolve) =>
      resolve({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            lists: [{ listId: 'api-personal-list-1', name: 'API個人リスト', isDefault: true }],
          },
        }),
      } as Response)
    );

    await waitFor(() => {
      expect(screen.getByText('API個人ToDo')).toBeInTheDocument();
    });
  });

  it('個人リスト一覧の取得に失敗した場合は console.error を出し、ToDo は描画しない', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const baseFetch = globalThis.fetch as jest.Mock;
    const fetchMock = jest
      .fn()
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/api/lists') {
          return Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as Response);
        }
        return baseFetch(input, init);
      });
    Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
    Object.defineProperty(window, 'fetch', { writable: true, value: fetchMock });

    render(
      <ListWorkspace initialScope="shared" initialGroupId="group-1" initialListId="group-list-1" />
    );
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '個人リスト一覧の取得に失敗しました',
        expect.anything()
      );
    });

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'personal' } });
    expect(screen.queryByRole('heading', { name: 'ToDo' })).not.toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });

  it('個人→共有→個人と往復すると、個人スコープで最後に選んだ個人リストに戻る', async () => {
    const baseFetch = globalThis.fetch as jest.Mock;
    const fetchMock = jest
      .fn()
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/api/lists') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                lists: [
                  { listId: 'api-personal-list-1', name: 'API個人リスト', isDefault: true },
                  { listId: 'api-personal-list-2', name: '2つ目の個人リスト', isDefault: false },
                ],
              },
            }),
          } as Response);
        }
        if (input === '/api/lists/api-personal-list-2/todos') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                todos: [
                  { todoId: 'personal-todo-2', title: '2つ目の個人ToDo', isCompleted: false },
                ],
              },
            }),
          } as Response);
        }
        return baseFetch(input, init);
      });
    Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
    Object.defineProperty(window, 'fetch', { writable: true, value: fetchMock });

    render(<ListWorkspace initialListId="api-personal-list-1" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '2つ目の個人リスト' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '2つ目の個人リスト' }));
    await waitFor(() => {
      expect(screen.getByText('2つ目の個人ToDo')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });
    await waitFor(() => {
      expect(screen.getByText('会議用の議題を共有する')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'personal' } });
    await waitFor(() => {
      expect(screen.getByText('2つ目の個人ToDo')).toBeInTheDocument();
    });
  });

  it('共有スコープへ切り替えると選択グループの共有リストを表示できる', async () => {
    render(<ListWorkspace initialListId="group-list-2" />);

    expect(screen.getByLabelText('表示範囲')).toHaveValue('personal');
    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });
    await waitFor(() => {
      expect(screen.getByLabelText('表示範囲')).toHaveValue('shared');
    });
    fireEvent.change(screen.getByLabelText('グループ'), { target: { value: 'group-2' } });
    expect(screen.getByLabelText('グループ')).toHaveValue('group-2');
    await waitFor(() => {
      expect(screen.getByText('ルームメイト家事分担')).toBeInTheDocument();
      expect(screen.getByText('ゴミ出し当番を確認する')).toBeInTheDocument();
    });
  });

  it('個人リストAPI有効時は個人ToDoをAPIから取得する', async () => {
    render(<ListWorkspace initialListId="api-personal-list-1" />);

    expect(screen.getByLabelText('表示範囲')).toHaveValue('personal');
    expect(screen.getByRole('heading', { name: '個人リスト' })).toBeInTheDocument();
    expect(screen.queryByLabelText('グループ')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('API個人ToDo')).toBeInTheDocument();
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/lists/api-personal-list-1/todos',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('共有リスト選択時は URL を変更せず ToDo を切り替える', async () => {
    render(<ListWorkspace initialListId="group-list-2" />);

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ルームメイト家事分担' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'ルームメイト家事分担' }));
    await waitFor(() => {
      expect(screen.getByText('ゴミ出し当番を確認する')).toBeInTheDocument();
    });
  });

  it('共有リストを作成するとAPIを呼び出してリストを追加する', async () => {
    render(<ListWorkspace initialListId="mock-default-list" />);

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '共有リストを作成' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '共有リストを作成' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'リスト名' }), {
      target: { value: '新しい共有リスト' },
    });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/groups/group-1/lists',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: '新しい共有リスト' }),
        })
      );
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '新しい共有リスト' })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        screen.getByText('共有リスト「新しい共有リスト」を作成しました。')
      ).toBeInTheDocument();
    });
  });

  it('共有リスト作成APIが失敗した場合はエラーメッセージを表示する', async () => {
    render(<ListWorkspace initialListId="mock-default-list" />);

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '共有リストを作成' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '共有リストを作成' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'リスト名' }), {
      target: { value: '失敗する共有リスト' },
    });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(screen.getByText('共有リスト名が不正です')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: '失敗する共有リスト' })).not.toBeInTheDocument();
  });

  it('共有スコープで編集ボタンをクリックすると共有リスト名を更新できる', async () => {
    promptSpy.mockReturnValue('買い物リスト（更新）');

    render(<ListWorkspace initialListId="mock-default-list" />);

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '買い物リスト（共有）を編集' })
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '買い物リスト（共有）を編集' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/groups/group-1/lists/group-list-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: '買い物リスト（更新）' }),
        })
      );
    });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '買い物リスト（更新）を編集' })
      ).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('共有リスト名を更新しました。')).toBeInTheDocument();
    });
  });

  it('共有スコープで削除ボタンをクリックすると共有リストを削除できる', async () => {
    confirmSpy.mockReturnValue(true);

    render(<ListWorkspace initialListId="mock-default-list" />);

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '買い物リスト（共有）を削除' })
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '買い物リスト（共有）を削除' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/groups/group-1/lists/group-list-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: '買い物リスト（共有）を削除' })
      ).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('共有リストを削除しました。')).toBeInTheDocument();
    });
  });

  it('個人スコープでは共有リストの編集・削除ボタンが表示されない', async () => {
    render(<ListWorkspace initialListId="mock-default-list" />);

    expect(screen.getByLabelText('表示範囲')).toHaveValue('personal');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /を編集$/ })).not.toBeInTheDocument();
    });
  });
});
