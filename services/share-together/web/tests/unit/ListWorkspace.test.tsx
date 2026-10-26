import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ListWorkspace } from '@/components/ListWorkspace';

const mockPush = jest.fn();
const mockRouter = { push: mockPush };
const mockUseSearchParams = jest.fn<URLSearchParams, []>();

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockUseSearchParams(),
}));

describe('ListWorkspace', () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let replaceStateSpy: jest.SpyInstance;

  beforeEach(() => {
    mockPush.mockClear();
    // Next.js のルーターを介さず URL を書き換えるため、history を直接観測する。
    replaceStateSpy = jest.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    mockUseSearchParams.mockReset();
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    originalFetch = globalThis.fetch;
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
    replaceStateSpy.mockRestore();
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

  it('共有リスト選択時は ToDo を切り替える', async () => {
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
    render(<ListWorkspace initialListId="mock-default-list" />);

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '買い物リスト（共有）を編集' })
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '買い物リスト（共有）を編集' }));
    const renameDialog = screen.getByRole('dialog');
    const renameInput = within(renameDialog).getByRole('textbox', { name: 'リスト名' });
    expect(renameInput).toHaveValue('買い物リスト（共有）');
    fireEvent.change(renameInput, { target: { value: '買い物リスト（更新）' } });
    fireEvent.click(within(renameDialog).getByRole('button', { name: '保存' }));

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
    render(<ListWorkspace initialListId="mock-default-list" />);

    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '買い物リスト（共有）を削除' })
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '買い物リスト（共有）を削除' }));
    const deleteDialog = screen.getByRole('dialog');
    expect(
      within(deleteDialog).getByText('「買い物リスト（共有）」を削除しますか？')
    ).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      '/api/groups/group-1/lists/group-list-1',
      expect.objectContaining({ method: 'DELETE' })
    );
    fireEvent.click(within(deleteDialog).getByRole('button', { name: '削除' }));

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

  it('共有リストの名前を変えずに保存しても API を呼ばない', async () => {
    render(<ListWorkspace initialListId="mock-default-list" />);
    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });
    fireEvent.click(await screen.findByRole('button', { name: '買い物リスト（共有）を編集' }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'リスト名' }), {
      target: { value: ' 買い物リスト（共有） ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      '/api/groups/group-1/lists/group-list-1',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('共有リストの削除確認でキャンセルすると削除しない', async () => {
    render(<ListWorkspace initialListId="mock-default-list" />);
    fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });
    fireEvent.click(await screen.findByRole('button', { name: '買い物リスト（共有）を削除' }));

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'キャンセル' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      '/api/groups/group-1/lists/group-list-1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(screen.getByRole('button', { name: '買い物リスト（共有）' })).toBeInTheDocument();
  });

  describe('共有リストが 0 件のときの空状態', () => {
    const EMPTY_MESSAGE = '共有リストはまだありません。「共有リストを作成」から追加できます。';

    const installFetch = (options: { groupsPending?: boolean } = {}) => {
      const baseFetch = globalThis.fetch as jest.Mock;
      const fetchMock = jest
        .fn()
        .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
          if (input === '/api/groups' && options.groupsPending) {
            return new Promise<Response>(() => {});
          }
          if (input === '/api/groups/group-2/lists') {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ data: { lists: [] } }),
            } as Response);
          }
          return baseFetch(input, init);
        });
      Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
      Object.defineProperty(window, 'fetch', { writable: true, value: fetchMock });
    };

    it('リストが 0 件のグループを選ぶと、右側に案内を出す', async () => {
      installFetch();
      render(<ListWorkspace initialListId="mock-default-list" />);
      fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });
      await screen.findByText('買い物リスト（共有）');
      expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('グループ'), { target: { value: 'group-2' } });

      expect(await screen.findByText(EMPTY_MESSAGE)).toBeInTheDocument();
    });

    it('共有の取得が終わる前は、0 件か未取得か区別できないので出さない', async () => {
      installFetch({ groupsPending: true });
      render(<ListWorkspace initialScope="shared" initialGroupId="group-2" initialListId="x" />);

      await screen.findByRole('button', { name: '共有リストを作成' });

      expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
    });

    it('個人スコープでは出さない', async () => {
      installFetch();
      render(<ListWorkspace initialListId="mock-default-list" />);
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          '/api/groups/group-2/lists',
          expect.anything()
        );
      });

      expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
    });

    it('共有リストを全部削除すると、案内に切り替わる', async () => {
      render(
        <ListWorkspace
          initialScope="shared"
          initialGroupId="group-1"
          initialListId="group-list-1"
        />
      );
      fireEvent.click(await screen.findByRole('button', { name: '買い物リスト（共有）を削除' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }));

      expect(await screen.findByText(EMPTY_MESSAGE)).toBeInTheDocument();
    });
  });

  it('個人スコープでは共有リストの編集・削除ボタンが表示されない', async () => {
    render(<ListWorkspace initialListId="mock-default-list" />);

    expect(screen.getByLabelText('表示範囲')).toHaveValue('personal');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /を編集$/ })).not.toBeInTheDocument();
    });
  });

  describe('選択状態の URL への書き戻し', () => {
    const installPersonalListsFetch = () => {
      const baseFetch = globalThis.fetch as jest.Mock;
      const fetchMock = jest
        .fn()
        .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
          if (input === '/api/lists' && init?.method === 'POST') {
            return Promise.resolve({
              ok: true,
              status: 201,
              json: async () => ({
                data: { listId: 'created-personal-list', name: '作成した個人リスト' },
              }),
            } as Response);
          }
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
          if (
            input === '/api/lists/api-personal-list-2/todos' ||
            input === '/api/lists/created-personal-list/todos'
          ) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ data: { todos: [] } }),
            } as Response);
          }
          return baseFetch(input, init);
        });
      Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
      Object.defineProperty(window, 'fetch', { writable: true, value: fetchMock });
    };

    it('人が選び直すまでは、表示しただけでは URL を書き換えない', async () => {
      render(<ListWorkspace initialListId="api-personal-list-1" />);

      await waitFor(() => {
        expect(screen.getByText('API個人ToDo')).toBeInTheDocument();
      });
      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it('読み込み後の補正 (無効な groupId の修正、先頭リストの選択) では URL を書き換えない', async () => {
      render(
        <ListWorkspace
          initialScope="shared"
          initialGroupId="no-such-group"
          initialListId="no-such-list"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('会議用の議題を共有する')).toBeInTheDocument();
      });
      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it('個人リストの選択では履歴を増やさず、ルーターも使わない', async () => {
      installPersonalListsFetch();
      render(<ListWorkspace initialListId="api-personal-list-1" />);

      fireEvent.click(await screen.findByRole('button', { name: '2つ目の個人リスト' }));

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenCalledTimes(1);
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('個人リストを選び直すと、選んだリストの listId へ書き換える', async () => {
      installPersonalListsFetch();
      render(<ListWorkspace initialListId="api-personal-list-1" />);
      const secondList = await screen.findByRole('button', { name: '2つ目の個人リスト' });

      fireEvent.click(secondList);

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenLastCalledWith(
          null,
          '',
          '/lists?listId=api-personal-list-2'
        );
      });
    });

    it('個人リストを作成すると、作成したリストの listId へ書き換える', async () => {
      installPersonalListsFetch();
      render(<ListWorkspace initialListId="api-personal-list-1" />);
      await screen.findByRole('button', { name: '2つ目の個人リスト' });

      fireEvent.click(screen.getByRole('button', { name: '個人リストを作成' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'リスト名' }), {
        target: { value: '作成した個人リスト' },
      });
      fireEvent.click(screen.getByRole('button', { name: '作成' }));

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenLastCalledWith(
          null,
          '',
          '/lists?listId=created-personal-list'
        );
      });
    });

    it('すでに URL が選択状態と同じなら書き換えない', async () => {
      mockUseSearchParams.mockReturnValue(new URLSearchParams('listId=api-personal-list-1'));
      render(<ListWorkspace initialListId="api-personal-list-1" />);
      fireEvent.click(await screen.findByRole('button', { name: 'API個人リスト' }));
      await waitFor(() => {
        expect(screen.getByText('API個人ToDo')).toBeInTheDocument();
      });

      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it('表示範囲を共有へ切り替えると、scope・groupId・共有リストの listId へ書き換える', async () => {
      render(<ListWorkspace initialListId="mock-default-list" />);

      fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenLastCalledWith(
          null,
          '',
          '/lists?scope=shared&groupId=group-1&listId=group-list-1'
        );
      });
    });

    it('共有から個人へ戻すと、scope と groupId を外して個人リストの listId へ書き換える', async () => {
      render(<ListWorkspace initialListId="mock-default-list" />);
      fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });
      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenLastCalledWith(
          null,
          '',
          '/lists?scope=shared&groupId=group-1&listId=group-list-1'
        );
      });

      fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'personal' } });

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenLastCalledWith(
          null,
          '',
          '/lists?listId=mock-default-list'
        );
      });
    });

    it('グループを切り替えると、切り替え先グループの先頭の共有リストへ書き換える', async () => {
      render(<ListWorkspace initialListId="mock-default-list" />);
      fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });
      await screen.findByText('買い物リスト（共有）');

      fireEvent.change(screen.getByLabelText('グループ'), { target: { value: 'group-2' } });

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenLastCalledWith(
          null,
          '',
          '/lists?scope=shared&groupId=group-2&listId=group-list-2'
        );
      });
    });

    it('共有リストを選び直すと、選んだリストの listId へ書き換える', async () => {
      const baseFetch = globalThis.fetch as jest.Mock;
      const fetchMock = jest
        .fn()
        .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
          if (input === '/api/groups/group-1/lists' && init?.method === undefined) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({
                data: {
                  lists: [
                    { listId: 'group-list-1', name: '買い物リスト（共有）' },
                    { listId: 'group-list-3', name: '旅行リスト（共有）' },
                  ],
                },
              }),
            } as Response);
          }
          if (input === '/api/groups/group-1/lists/group-list-3/todos') {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ data: { todos: [] } }),
            } as Response);
          }
          return baseFetch(input, init);
        });
      Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
      Object.defineProperty(window, 'fetch', { writable: true, value: fetchMock });

      render(
        <ListWorkspace
          initialScope="shared"
          initialGroupId="group-1"
          initialListId="group-list-1"
        />
      );
      const travelList = await screen.findByRole('button', { name: '旅行リスト（共有）' });

      fireEvent.click(travelList);

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenLastCalledWith(
          null,
          '',
          '/lists?scope=shared&groupId=group-1&listId=group-list-3'
        );
      });
    });

    it('共有リストを作成すると、作成したリストの listId へ書き換える', async () => {
      render(
        <ListWorkspace
          initialScope="shared"
          initialGroupId="group-1"
          initialListId="group-list-1"
        />
      );
      await screen.findByText('買い物リスト（共有）');

      fireEvent.click(screen.getByRole('button', { name: '共有リストを作成' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'リスト名' }), {
        target: { value: '新しい共有リスト' },
      });
      fireEvent.click(screen.getByRole('button', { name: '作成' }));

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenLastCalledWith(
          null,
          '',
          '/lists?scope=shared&groupId=group-1&listId=created-shared-list'
        );
      });
    });

    it('共有スコープの直リンクで開くと、URL が同じなので書き換えない', async () => {
      mockUseSearchParams.mockReturnValue(
        new URLSearchParams('scope=shared&groupId=group-2&listId=group-list-2')
      );
      render(
        <ListWorkspace
          initialScope="shared"
          initialGroupId="group-2"
          initialListId="group-list-2"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('ゴミ出し当番を確認する')).toBeInTheDocument();
      });
      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it('共有リストの取得が終わるまでは書き戻さない', async () => {
      render(
        <ListWorkspace
          initialScope="shared"
          initialGroupId="group-1"
          initialListId="group-list-1"
        />
      );

      expect(replaceStateSpy).not.toHaveBeenCalled();
      await screen.findByText('買い物リスト（共有）');
    });

    it('共有リストを全部削除すると、listId を省いた groupId までの URL へ書き換える', async () => {
      render(
        <ListWorkspace
          initialScope="shared"
          initialGroupId="group-1"
          initialListId="group-list-1"
        />
      );
      await screen.findByRole('button', { name: '買い物リスト（共有）を削除' });

      fireEvent.click(screen.getByRole('button', { name: '買い物リスト（共有）を削除' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }));
      await screen.findByText('共有リストを削除しました。');

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenLastCalledWith(
          null,
          '',
          '/lists?scope=shared&groupId=group-1'
        );
      });
    });

    it('リストが 0 件のグループへ切り替えると、groupId までの URL へ書き換える', async () => {
      const baseFetch = globalThis.fetch as jest.Mock;
      const fetchMock = jest
        .fn()
        .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
          if (input === '/api/groups/group-2/lists') {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ data: { lists: [] } }),
            } as Response);
          }
          return baseFetch(input, init);
        });
      Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
      Object.defineProperty(window, 'fetch', { writable: true, value: fetchMock });
      render(<ListWorkspace initialListId="mock-default-list" />);
      fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });
      await screen.findByText('買い物リスト（共有）');

      fireEvent.change(screen.getByLabelText('グループ'), { target: { value: 'group-2' } });

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenLastCalledWith(
          null,
          '',
          '/lists?scope=shared&groupId=group-2'
        );
      });
    });

    it('共有グループが無いまま共有へ切り替えると、scope だけの URL へ書き換える', async () => {
      const baseFetch = globalThis.fetch as jest.Mock;
      const fetchMock = jest
        .fn()
        .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
          if (input === '/api/groups') {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ data: { groups: [] } }),
            } as Response);
          }
          return baseFetch(input, init);
        });
      Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
      Object.defineProperty(window, 'fetch', { writable: true, value: fetchMock });
      render(<ListWorkspace initialListId="mock-default-list" />);

      fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenLastCalledWith(null, '', '/lists?scope=shared');
      });
    });

    it('共有の取得が終わる前に共有へ切り替えても、取得が終わるまでは書き換えない', async () => {
      const baseFetch = globalThis.fetch as jest.Mock;
      const fetchMock = jest
        .fn()
        .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
          if (input === '/api/groups') {
            return new Promise<Response>(() => {});
          }
          return baseFetch(input, init);
        });
      Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
      Object.defineProperty(window, 'fetch', { writable: true, value: fetchMock });
      render(<ListWorkspace initialListId="mock-default-list" />);

      fireEvent.change(screen.getByLabelText('表示範囲'), { target: { value: 'shared' } });

      await waitFor(() => {
        expect(screen.getByLabelText('表示範囲')).toHaveValue('shared');
      });
      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it('人が選び直したあとに外部のナビゲーションでクエリが外れたら、現在の選択状態で URL を書き戻す', async () => {
      mockUseSearchParams.mockReturnValue(new URLSearchParams('listId=api-personal-list-1'));
      const { rerender } = render(<ListWorkspace initialListId="api-personal-list-1" />);
      fireEvent.click(await screen.findByRole('button', { name: 'API個人リスト' }));
      await waitFor(() => {
        expect(screen.getByText('API個人ToDo')).toBeInTheDocument();
      });
      expect(replaceStateSpy).not.toHaveBeenCalled();

      mockUseSearchParams.mockReturnValue(new URLSearchParams());
      rerender(<ListWorkspace initialListId="api-personal-list-1" />);

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/lists?listId=api-personal-list-1');
      });
    });

    it('人が選び直す前に外部のナビゲーションでクエリが外れても、書き戻さない', async () => {
      mockUseSearchParams.mockReturnValue(new URLSearchParams('listId=api-personal-list-1'));
      const { rerender } = render(<ListWorkspace initialListId="api-personal-list-1" />);
      await waitFor(() => {
        expect(screen.getByText('API個人ToDo')).toBeInTheDocument();
      });

      mockUseSearchParams.mockReturnValue(new URLSearchParams());
      rerender(<ListWorkspace initialListId="api-personal-list-1" />);

      expect(replaceStateSpy).not.toHaveBeenCalled();
    });
  });
});
