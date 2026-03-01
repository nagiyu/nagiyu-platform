import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import Home from '@/app/page';

describe('Home', () => {
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: jest.fn().mockResolvedValue({} as Response),
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
  });
});
