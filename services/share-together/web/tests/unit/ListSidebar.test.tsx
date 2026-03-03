import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ListSidebar, MOCK_PERSONAL_LISTS } from '@/components/ListSidebar';

describe('ListSidebar', () => {
  let originalFetch: typeof globalThis.fetch;
  let promptSpy: jest.SpyInstance;
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    promptSpy = jest.spyOn(window, 'prompt');
    confirmSpy = jest.spyOn(window, 'confirm');
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: originalFetch,
    });
    promptSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it('モックの個人リスト一覧と作成ボタンを表示し、選択中リストを強調してリンク表示する', () => {
    render(
      <ListSidebar
        heading="個人リスト"
        createButtonLabel="個人リストを作成"
        selectedListId="mock-work-list"
        lists={MOCK_PERSONAL_LISTS}
        hrefPrefix="/lists"
      />
    );

    expect(screen.getByRole('heading', { name: '個人リスト' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '個人リストを作成' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'デフォルトリスト' })).toHaveAttribute(
      'href',
      '/lists/mock-default-list'
    );

    const workListLink = screen.getByRole('link', { name: '仕事' });
    expect(workListLink).toHaveClass('Mui-selected');
    expect(screen.getByRole('link', { name: 'デフォルトリスト' })).not.toHaveClass('Mui-selected');
  });

  it('APIモードで一覧取得・作成・名称変更・削除を実行できる', async () => {
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
        apiEnabled
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
});
