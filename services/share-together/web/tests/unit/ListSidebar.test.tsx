import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ListSidebar } from '@/components/ListSidebar';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('ListSidebar', () => {
  let originalFetch: typeof globalThis.fetch;
  let promptSpy: jest.SpyInstance;
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    promptSpy = jest.spyOn(window, 'prompt');
    confirmSpy = jest.spyOn(window, 'confirm');
    mockPush.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: originalFetch,
    });
    promptSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it('一覧取得・作成・名称変更・削除を API 経由で実行できる', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            lists: [
              { listId: 'default-list', name: 'デフォルトリスト', isDefault: true },
              { listId: 'work-list', name: '仕事', isDefault: false },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { listId: 'new-list', name: '新規リスト', isDefault: false },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { listId: 'work-list', name: '仕事(更新)', isDefault: false },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
      } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    promptSpy.mockReturnValueOnce('新規リスト').mockReturnValueOnce('仕事(更新)');
    confirmSpy.mockReturnValue(true);

    render(
      <ListSidebar
        heading="個人リスト"
        createButtonLabel="個人リストを作成"
        selectedListId="work-list"
        hrefPrefix="/lists"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'デフォルトリスト' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '仕事' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '個人リストを作成' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '新規リスト' }),
      });
      expect(mockPush).toHaveBeenCalledWith('/lists/new-list');
    });

    fireEvent.click(screen.getByRole('button', { name: '仕事を編集' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/lists/work-list', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '仕事(更新)' }),
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('link', { name: '仕事(更新)' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '仕事(更新)を削除' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/lists/work-list', {
        method: 'DELETE',
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: '仕事(更新)' })).not.toBeInTheDocument();
    });
  });

  it('一覧取得に失敗した場合はエラーメッセージを表示する', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: { message: '一覧取得に失敗しました。' },
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(
      <ListSidebar
        heading="個人リスト"
        createButtonLabel="個人リストを作成"
        selectedListId="default-list"
        hrefPrefix="/lists"
      />
    );

    expect(await screen.findByText('一覧取得に失敗しました。')).toBeInTheDocument();
  });

  it('外部管理リストが渡された場合は一覧をそのまま表示し、作成時にコールバックを呼ぶ', async () => {
    const fetchMock = jest.fn();
    const handleCreate = jest.fn();
    const handleSelect = jest.fn();
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(
      <ListSidebar
        heading="共有リスト"
        createButtonLabel="共有リストを作成"
        selectedListId="shared-2"
        lists={[
          { listId: 'shared-1', name: '旅行準備' },
          { listId: 'shared-2', name: '買い出し' },
        ]}
        hrefPrefix="/groups/group-1/lists"
        onCreateList={handleCreate}
        onListSelect={handleSelect}
      />
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '旅行準備' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '買い出し' })).toHaveClass('Mui-selected');
    expect(screen.queryByRole('button', { name: '旅行準備を編集' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '旅行準備を削除' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '共有リストを作成' }));
    expect(handleCreate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '旅行準備' }));
    expect(handleSelect).toHaveBeenCalledWith('shared-1');
  });
});
