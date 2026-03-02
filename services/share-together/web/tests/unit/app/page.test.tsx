import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import Home from '@/app/page';

describe('Home', () => {
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    window.sessionStorage.clear();
    const fetchMock = jest.fn().mockImplementation((input: string) => {
      if (input === '/api/users') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response);
      }

      if (input === '/api/lists') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              lists: [{ listId: 'default-list-id', name: 'デフォルトリスト', isDefault: true }],
            },
          }),
        } as Response);
      }

      if (input === '/api/lists/default-list-id/todos') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              todos: [{ todoId: 'todo-1', title: '牛乳を買う', isCompleted: false }],
            },
          }),
        } as Response);
      }

      throw new Error(`Unexpected fetch input: ${input}`);
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

  it('デフォルト個人リストの TodoList を API 取得結果で表示する', async () => {
    render(<Home />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'デフォルト個人リスト' })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'ToDo' })).toBeInTheDocument();
    });
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toBeInTheDocument();
    expect(screen.getByText('牛乳を買う')).toBeInTheDocument();
  });

  it('初回表示時にユーザー登録 API を自動実行する', async () => {
    render(<Home />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/users', { method: 'POST' });
    });
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/lists/default-list-id/todos');
    });

    expect(window.sessionStorage.getItem('share-together:user-registration-completed')).toBe(
      'true'
    );
  });

  it('登録済みフラグがある場合はユーザー登録 API を再実行しない', async () => {
    window.sessionStorage.setItem('share-together:user-registration-completed', 'true');

    render(<Home />);
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/api/users', { method: 'POST' });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/lists');
    });
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/lists/default-list-id/todos');
    });
  });
});
