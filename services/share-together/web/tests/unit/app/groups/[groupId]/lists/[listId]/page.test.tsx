import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import GroupListDetailPage from '@/app/groups/[groupId]/lists/[listId]/page';
import { headers } from 'next/headers';

jest.mock('@/components/Navigation', () => ({
  Navigation: () => <div>Navigation</div>,
}));

jest.mock('@/components/ListSidebar', () => ({
  ListSidebar: ({ heading }: { heading: string }) => <div>{heading}</div>,
}));

jest.mock('@/components/TodoList', () => ({
  TodoList: () => <div>TodoList</div>,
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

describe('GroupListDetailPage', () => {
  let originalFetch!: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: originalFetch,
    });
  });

  it('グループ共有リスト詳細ページで API 取得した内容を表示する', async () => {
    (headers as jest.Mock).mockResolvedValue({
      get: (key: string) => (key === 'host' ? 'localhost:3000' : null),
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          lists: [
            { listId: 'mock-list-1', name: '買い物リスト（共有）' },
            { listId: 'mock-list-2', name: '旅行準備リスト' },
          ],
        },
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(
      await GroupListDetailPage({
        params: Promise.resolve({ groupId: 'mock-group-1', listId: 'mock-list-1' }),
      })
    );

    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/groups/mock-group-1/lists', {
      cache: 'no-store',
    });
    expect(screen.getByRole('heading', { name: '買い物リスト（共有）' })).toBeInTheDocument();
    expect(screen.getByText('リストID: mock-list-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '更新' })).toHaveAttribute(
      'href',
      '/groups/mock-group-1/lists/mock-list-1'
    );
    expect(screen.getByText('共有リスト')).toBeInTheDocument();
    expect(screen.getByText('TodoList')).toBeInTheDocument();
  });

  it('host ヘッダーが取得できない場合はフォールバック名を表示する', async () => {
    (headers as jest.Mock).mockResolvedValue({ get: () => null });
    const fetchMock = jest.fn();
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(
      await GroupListDetailPage({
        params: Promise.resolve({ groupId: 'mock-group-1', listId: 'mock-list-1' }),
      })
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'グループ共有リスト詳細' })).toBeInTheDocument();
  });

  it('指定した listId が API 一覧にない場合はフォールバック名を表示する', async () => {
    (headers as jest.Mock).mockResolvedValue({
      get: (key: string) => (key === 'host' ? 'localhost:3000' : null),
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          lists: [{ listId: 'another-list', name: '別の共有リスト' }],
        },
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(
      await GroupListDetailPage({
        params: Promise.resolve({ groupId: 'mock-group-1', listId: 'missing-list' }),
      })
    );

    expect(screen.getByRole('heading', { name: 'グループ共有リスト詳細' })).toBeInTheDocument();
  });

  it('x-forwarded ヘッダーがある場合は優先して API を呼び出す', async () => {
    (headers as jest.Mock).mockResolvedValue({
      get: (key: string) => {
        if (key === 'x-forwarded-host') {
          return 'example.com';
        }
        if (key === 'x-forwarded-proto') {
          return 'https';
        }
        if (key === 'host') {
          return 'localhost:3000';
        }
        return null;
      },
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { lists: [] } }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(
      await GroupListDetailPage({
        params: Promise.resolve({ groupId: 'mock-group-1', listId: 'mock-list-1' }),
      })
    );

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/api/groups/mock-group-1/lists', {
      cache: 'no-store',
    });
  });
});
