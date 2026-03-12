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

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    const fetchMock = jest.fn().mockImplementation((input: string) => {
      if (input === '/api/groups') {
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

      if (input === '/api/groups/group-1/lists') {
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

      if (input === '/api/groups/group-2/lists') {
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

      if (input === '/api/groups/group-1/lists/group-list-1/todos') {
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

      if (input === '/api/groups/group-2/lists/group-list-2/todos') {
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

      if (input === '/api/lists/api-personal-list-1/todos') {
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

      if (input === '/api/lists/mock-default-list/todos') {
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

      if (input === '/api/lists/group-list-2/todos') {
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

      if (input === '/api/lists') {
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

      throw new Error(`予期しないfetch呼び出し: ${input}`);
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
  });

  it('個人と共有を切り替えると共有グループと共有ToDoをAPIから表示する', async () => {
    render(<ListWorkspace initialListId="mock-default-list" />);

    fireEvent.mouseDown(screen.getByLabelText('表示範囲'));
    fireEvent.click(screen.getByRole('option', { name: '共有' }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'グループ' })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('会議用の議題を共有する')).toBeInTheDocument();
    });
  });

  it('共有から個人に戻したときに個人リストのToDoを取得する', async () => {
    render(<ListWorkspace initialListId="mock-default-list" />);

    fireEvent.mouseDown(screen.getByLabelText('表示範囲'));
    fireEvent.click(screen.getByRole('option', { name: '共有' }));
    await waitFor(() => {
      expect(screen.getByText('会議用の議題を共有する')).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByLabelText('表示範囲'));
    fireEvent.click(screen.getByRole('option', { name: '個人' }));
    await waitFor(() => {
      expect(screen.getByText('個人ToDo(初期)')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText('ToDo一覧の取得に失敗しました。')).not.toBeInTheDocument();
    });
  });

  it('共有スコープへ切り替えると選択グループの共有リストを表示できる', async () => {
    render(<ListWorkspace initialListId="group-list-2" />);

    expect(screen.getByRole('combobox', { name: '表示範囲' })).toHaveTextContent('個人');
    fireEvent.mouseDown(screen.getByLabelText('表示範囲'));
    fireEvent.click(screen.getByRole('option', { name: '共有' }));
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '表示範囲' })).toHaveTextContent('共有');
    });
    fireEvent.mouseDown(screen.getByLabelText('グループ'));
    fireEvent.click(screen.getByRole('option', { name: 'ルームメイト' }));
    expect(screen.getByRole('combobox', { name: 'グループ' })).toHaveTextContent('ルームメイト');
    await waitFor(() => {
      expect(screen.getByText('ルームメイト家事分担')).toBeInTheDocument();
      expect(screen.getByText('ゴミ出し当番を確認する')).toBeInTheDocument();
    });
  });

  it('個人リストAPI有効時は個人ToDoをAPIから取得する', async () => {
    render(<ListWorkspace initialListId="api-personal-list-1" />);

    expect(screen.getByRole('combobox', { name: '表示範囲' })).toHaveTextContent('個人');
    expect(screen.getByRole('heading', { name: '個人リスト' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'グループ' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('API個人ToDo')).toBeInTheDocument();
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/lists/api-personal-list-1/todos');
  });

  it('共有リスト選択時は URL を変更せず ToDo を切り替える', async () => {
    render(<ListWorkspace initialListId="group-list-2" />);

    fireEvent.mouseDown(screen.getByLabelText('表示範囲'));
    fireEvent.click(screen.getByRole('option', { name: '共有' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ルームメイト家事分担' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'ルームメイト家事分担' }));
    await waitFor(() => {
      expect(screen.getByText('ゴミ出し当番を確認する')).toBeInTheDocument();
    });
  });
});
