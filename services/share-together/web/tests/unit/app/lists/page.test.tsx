import ListsPage from '@/app/lists/page';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
  redirect: jest.fn(),
}));

describe('ListsPage', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: originalFetch,
    });
  });

  it('デフォルト個人リストへリダイレクトする', async () => {
    (headers as jest.Mock).mockResolvedValue({
      get: (key: string) => (key === 'host' ? 'localhost:3000' : null),
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          lists: [{ listId: 'default-list', name: 'デフォルトリスト', isDefault: true }],
        },
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    await ListsPage();

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/lists', {
      cache: 'no-store',
    });
    expect(redirect).toHaveBeenCalledWith('/lists/default-list');
  });

  it('host ヘッダーがない場合は notFound を呼び出す', async () => {
    (headers as jest.Mock).mockResolvedValue({
      get: () => null,
    });
    const fetchMock = jest.fn();
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    await ListsPage();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(notFound).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
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
          lists: [{ listId: 'forwarded-default-list', name: 'デフォルトリスト', isDefault: true }],
        },
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    await ListsPage();

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/api/lists', { cache: 'no-store' });
    expect(redirect).toHaveBeenCalledWith('/lists/forwarded-default-list');
  });

  it('API取得に失敗した場合は notFound を呼び出す', async () => {
    (headers as jest.Mock).mockResolvedValue({
      get: (key: string) => (key === 'host' ? 'localhost:3000' : null),
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    await ListsPage();

    expect(notFound).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('デフォルトリストが存在しない場合は notFound を呼び出す', async () => {
    (headers as jest.Mock).mockResolvedValue({
      get: (key: string) => (key === 'host' ? 'localhost:3000' : null),
    });
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

    await ListsPage();

    expect(notFound).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
