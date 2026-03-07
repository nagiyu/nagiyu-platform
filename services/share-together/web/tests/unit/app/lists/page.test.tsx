import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import ListsPage from '@/app/lists/page';

jest.mock('@/components/ListWorkspace', () => ({
  ListWorkspace: ({ initialListId }: { initialListId: string }) => <div>ListWorkspace: {initialListId}</div>,
}));

describe('ListsPage', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: originalFetch,
    });
  });

  it('デフォルト個人リストを解決して ListWorkspace を表示する', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          lists: [
            { listId: 'work-list', name: '仕事', isDefault: false },
            { listId: 'default-list', name: 'デフォルトリスト', isDefault: true },
          ],
        },
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(<ListsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'リスト' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('ListWorkspace: default-list')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/lists', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('デフォルトリストがない場合はエラーメッセージを表示する', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          lists: [{ listId: 'work-list', name: '仕事', isDefault: false }],
        },
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(<ListsPage />);

    expect(await screen.findByText('デフォルト個人リストの取得に失敗しました。')).toBeInTheDocument();
  });
});
