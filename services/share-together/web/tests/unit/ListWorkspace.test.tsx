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
              todos: [{ todoId: 'group-todo-1', title: '会議用の議題を共有する', isCompleted: false }],
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
              todos: [{ todoId: 'group-todo-2', title: 'ゴミ出し当番を確認する', isCompleted: false }],
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

  it('共有リストIDで開いた場合は共有スコープと対応グループを初期表示する', async () => {
    render(<ListWorkspace initialListId="group-list-2" />);

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '表示範囲' })).toHaveTextContent('共有');
    });
    expect(screen.getByRole('combobox', { name: 'グループ' })).toHaveTextContent('ルームメイト');
    expect(screen.getByText('ルームメイト家事分担')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('ゴミ出し当番を確認する')).toBeInTheDocument();
    });
  });

  it('個人リストAPI有効時は個人ToDoをAPIから取得する', async () => {
    render(<ListWorkspace initialListId="api-personal-list-1" enablePersonalListApi />);

    expect(screen.getByRole('combobox', { name: '表示範囲' })).toHaveTextContent('個人');
    expect(screen.getByRole('heading', { name: '個人リスト' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'グループ' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('API個人ToDo')).toBeInTheDocument();
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/lists/api-personal-list-1/todos');
  });

  it('共有リストリンクはグループ配下のURLを指す', async () => {
    render(<ListWorkspace initialListId="group-list-2" />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'ルームメイト家事分担' })).toHaveAttribute(
        'href',
        '/groups/group-2/lists/group-list-2'
      );
    });
  });
});
