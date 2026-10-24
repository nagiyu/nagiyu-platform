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
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/lists',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
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

    expect(
      await screen.findByText('デフォルト個人リストの取得に失敗しました。')
    ).toBeInTheDocument();
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

  it('表示後にクエリが書き換わっても、初回のクエリを ListWorkspace の初期値に使い続け API も再取得しない', async () => {
    const fetchMock = jest.fn();
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('scope=shared&groupId=group-2&listId=group-list-2')
    );
    const { rerender } = render(<ListsPage />);
    await screen.findByText('ListWorkspace: group-list-2:shared:group-2');

    mockUseSearchParams.mockReturnValue(new URLSearchParams('listId=personal-list'));
    rerender(<ListsPage />);

    expect(screen.getByText('ListWorkspace: group-list-2:shared:group-2')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('個人リストの listId が指定されたとき', () => {
    const mockPersonalLists = () => {
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
      Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
      return fetchMock;
    };

    it('一覧に存在するならその listId を開く', async () => {
      mockPersonalLists();
      mockUseSearchParams.mockReturnValue(new URLSearchParams('listId=work-list'));

      render(<ListsPage />);

      expect(await screen.findByText('ListWorkspace: work-list:personal:')).toBeInTheDocument();
    });

    it('一覧に無い (別の端末で削除された) ならデフォルトの個人リストを開く', async () => {
      mockPersonalLists();
      mockUseSearchParams.mockReturnValue(new URLSearchParams('listId=deleted-list'));

      render(<ListsPage />);

      expect(await screen.findByText('ListWorkspace: default-list:personal:')).toBeInTheDocument();
    });

    it('一覧の取得に失敗したときは、指定された listId をそのまま開く', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
      Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
      mockUseSearchParams.mockReturnValue(new URLSearchParams('listId=work-list'));

      render(<ListsPage />);

      expect(await screen.findByText('ListWorkspace: work-list:personal:')).toBeInTheDocument();
      consoleError.mockRestore();
    });
  });

  it('listId の無い共有スコープ (リストが 0 件のグループなど) は、デフォルト個人リストを解決して groupId を引き継ぐ', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { lists: [{ listId: 'default-list', name: 'デフォルトリスト', isDefault: true }] },
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
    mockUseSearchParams.mockReturnValue(new URLSearchParams('scope=shared&groupId=group-3'));

    render(<ListsPage />);

    expect(
      await screen.findByText('ListWorkspace: default-list:shared:group-3')
    ).toBeInTheDocument();
  });

  it('グループも無い scope=shared だけのクエリでも開ける', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { lists: [{ listId: 'default-list', name: 'デフォルトリスト', isDefault: true }] },
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', { writable: true, value: fetchMock });
    mockUseSearchParams.mockReturnValue(new URLSearchParams('scope=shared'));

    render(<ListsPage />);

    expect(await screen.findByText('ListWorkspace: default-list:shared:')).toBeInTheDocument();
  });
});
