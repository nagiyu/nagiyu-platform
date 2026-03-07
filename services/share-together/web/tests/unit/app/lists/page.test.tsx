import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import ListsPage from '@/app/lists/page';

const mockUseSearchParams = jest.fn(() => new URLSearchParams());

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

jest.mock('@/components/ListWorkspace', () => ({
  ListWorkspace: ({
    initialListId,
    initialScope,
    initialGroupId,
  }: {
    initialListId: string;
    initialScope?: string;
    initialGroupId?: string;
  }) => (
    <div>
      ListWorkspace: {initialListId}:{initialScope}:{initialGroupId}
    </div>
  ),
}));

describe('ListsPage', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
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
      expect(screen.getByText('ListWorkspace: default-list:personal:')).toBeInTheDocument();
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

  it('共有リスト指定のクエリがある場合は API 取得を行わず初期値として反映する', async () => {
    const fetchMock = jest.fn();
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('scope=shared&groupId=group-2&listId=group-list-2')
    );

    render(<ListsPage />);

    await waitFor(() => {
      expect(screen.getByText('ListWorkspace: group-list-2:shared:group-2')).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/lists', expect.anything());
  });
});
