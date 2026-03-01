import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import Home from '@/app/page';

describe('Home', () => {
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    window.sessionStorage.clear();
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response),
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: originalFetch,
    });
  });

  it('デフォルト個人リストの TodoList をモック表示する', () => {
    render(<Home />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'デフォルト個人リスト' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'ToDo' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toBeInTheDocument();
    expect(screen.getByText('牛乳を買う')).toBeInTheDocument();
  });

  it('初回表示時にユーザー登録 API を自動実行する', async () => {
    render(<Home />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/users', { method: 'POST' });
    });

    expect(window.sessionStorage.getItem('share-together:user-registration-completed')).toBe(
      'true'
    );
  });

  it('登録済みフラグがある場合はユーザー登録 API を再実行しない', async () => {
    window.sessionStorage.setItem('share-together:user-registration-completed', 'true');

    render(<Home />);

    await waitFor(() => {
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});
