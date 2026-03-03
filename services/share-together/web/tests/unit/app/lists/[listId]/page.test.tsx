import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import PersonalListDetailPage from '@/app/lists/[listId]/page';
import { headers } from 'next/headers';

jest.mock('@/components/Navigation', () => ({
  Navigation: () => <div>Navigation</div>,
}));

jest.mock('@/components/ListWorkspace', () => ({
  ListWorkspace: () => <div>ListWorkspace</div>,
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

describe('PersonalListDetailPage', () => {
  let originalFetch!: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    (headers as jest.Mock).mockResolvedValue({
      get: (key: string) => (key === 'host' ? 'localhost:3000' : null),
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: originalFetch,
    });
  });

  it('リスト詳細ページに ListWorkspace をモック表示する', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          listId: 'mock-work-list',
          name: '仕事',
          ownerUserId: 'user-1',
          isDefault: false,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(
      await PersonalListDetailPage({
        params: Promise.resolve({ listId: 'mock-work-list' }),
      })
    );

    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/lists/mock-work-list', {
      cache: 'no-store',
    });
    expect(screen.getByRole('heading', { level: 1, name: '仕事' })).toBeInTheDocument();
    expect(screen.getByText('リストID: mock-work-list')).toBeInTheDocument();
    expect(screen.getByText('ListWorkspace')).toBeInTheDocument();
  });

  it('API取得に失敗した場合はフォールバック名を表示する', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(
      await PersonalListDetailPage({
        params: Promise.resolve({ listId: 'unknown-list' }),
      })
    );

    expect(screen.getByRole('heading', { level: 1, name: '個人リスト' })).toBeInTheDocument();
    expect(screen.getByText('リストID: unknown-list')).toBeInTheDocument();
  });

  it('host ヘッダーが取得できない場合はフォールバック名を表示する', async () => {
    (headers as jest.Mock).mockResolvedValue({
      get: () => null,
    });
    const fetchMock = jest.fn();
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(
      await PersonalListDetailPage({
        params: Promise.resolve({ listId: 'list-without-host' }),
      })
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: '個人リスト' })).toBeInTheDocument();
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
      json: async () => ({
        data: {
          listId: 'forwarded-list',
          name: '転送ヘッダー経由リスト',
          ownerUserId: 'user-1',
          isDefault: false,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(
      await PersonalListDetailPage({
        params: Promise.resolve({ listId: 'forwarded-list' }),
      })
    );

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/api/lists/forwarded-list', {
      cache: 'no-store',
    });
    expect(
      screen.getByRole('heading', { level: 1, name: '転送ヘッダー経由リスト' })
    ).toBeInTheDocument();
  });
});
