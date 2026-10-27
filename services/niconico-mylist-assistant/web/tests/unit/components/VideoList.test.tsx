/**
 * VideoList のユニットテスト
 *
 * 取得の重なりで古い応答が表示を上書きしないこと、初回取得が URL の値で行われることを検証する。
 * fetch と next/navigation をモック化し、子コンポーネントはスタブ化して VideoList の挙動に絞る。
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { VideosListResponse } from '@nagiyu/niconico-mylist-assistant-core';
import VideoList from '../../../src/components/VideoList';

const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@nagiyu/ui', () => ({
  ErrorAlert: ({ message, onClose }: { message: string; onClose?: () => void }) => (
    <div role="alert">
      {message}
      <button onClick={onClose}>閉じる</button>
    </div>
  ),
  LoadingState: () => <div data-testid="loading-state" />,
}));

jest.mock('../../../src/components/VideoCard', () => ({
  __esModule: true,
  default: ({
    video,
    onToggleFavorite,
    onToggleSkip,
    onClick,
    disabled,
  }: {
    video: {
      videoId: string;
      title: string;
      userSetting?: { isFavorite: boolean; isSkip: boolean };
    };
    onToggleFavorite: (id: string, value: boolean) => void;
    onToggleSkip: (id: string, value: boolean) => void;
    onClick: (id: string) => void;
    disabled?: boolean;
  }) => {
    const isFavorite = video.userSetting?.isFavorite ?? false;
    const isSkip = video.userSetting?.isSkip ?? false;
    return (
      <div data-testid="video-card">
        <span>{video.title}</span>
        <button
          disabled={disabled}
          data-favorite={String(isFavorite)}
          onClick={() => onToggleFavorite(video.videoId, !isFavorite)}
        >
          お気に入り
        </button>
        <button
          disabled={disabled}
          data-skip={String(isSkip)}
          onClick={() => onToggleSkip(video.videoId, !isSkip)}
        >
          スキップ
        </button>
        <button onClick={() => onClick(video.videoId)}>詳細</button>
      </div>
    );
  },
}));

jest.mock('../../../src/components/VideoListFilters', () => ({
  __esModule: true,
  default: ({
    favoriteFilter,
    skipFilter,
    searchKeyword,
    onFavoriteFilterChange,
    onSkipFilterChange,
    onSearch,
  }: {
    favoriteFilter: string;
    skipFilter: string;
    searchKeyword: string;
    onFavoriteFilterChange: (value: string) => void;
    onSkipFilterChange: (value: string) => void;
    onSearch: (value: string) => void;
  }) => (
    <div>
      <span data-testid="favorite-filter">{favoriteFilter}</span>
      <span data-testid="skip-filter">{skipFilter}</span>
      <span data-testid="search-keyword">{searchKeyword}</span>
      <button onClick={() => onFavoriteFilterChange('true')}>お気に入りに変更</button>
      <button onClick={() => onSkipFilterChange('true')}>スキップに変更</button>
      <button onClick={() => onSearch(' キーワード ')}>検索</button>
    </div>
  ),
}));

jest.mock('../../../src/components/VideoListPagination', () => ({
  __esModule: true,
  default: ({ onPageChange }: { onPageChange: (offset: number) => void }) => (
    <button onClick={() => onPageChange(20)}>次のページ</button>
  ),
}));

jest.mock('../../../src/components/VideoDetailModal', () => ({
  __esModule: true,
  default: ({
    videoId,
    open,
    onClose,
    onUpdate,
  }: {
    videoId: string | null;
    open: boolean;
    onClose: () => void;
    onUpdate: () => void;
  }) =>
    open ? (
      <div data-testid="detail-modal">
        <span>{videoId}</span>
        <button onClick={onUpdate}>モーダル更新</button>
        <button onClick={onClose}>モーダルを閉じる</button>
      </div>
    ) : null,
}));

const createResponse = (titles: string[], offset = 0): VideosListResponse => ({
  videos: titles.map((title, index) => ({
    videoId: `sm${offset + index}`,
    title,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    length: '1:00',
    createdAt: 0,
  })) as unknown as VideosListResponse['videos'],
  total: titles.length,
  limit: 20,
  offset,
});

const okResponse = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

type Deferred = {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
  signal: AbortSignal | undefined;
  url: string;
};

/** 応答の到着タイミングをテスト側で制御できる fetch モックを作る */
const mockDeferredFetch = () => {
  const calls: Deferred[] = [];
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    let resolve!: Deferred['resolve'];
    let reject!: Deferred['reject'];
    const promise = new Promise<Response>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    calls.push({ promise, resolve, reject, signal: init?.signal ?? undefined, url: String(input) });
    return promise;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return { calls, fetchMock };
};

const listCallUrls = (fetchMock: jest.Mock) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/videos?'));

describe('VideoList', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    window.scrollTo = jest.fn();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('初回取得', () => {
    it('?favorite=true で開くと最初の取得から isFavorite=true が付き、絞り込み無しの取得は飛ばない', async () => {
      mockSearchParams = new URLSearchParams('favorite=true');
      const { fetchMock } = mockDeferredFetch();
      fetchMock.mockImplementation(async () => okResponse(createResponse(['お気に入り動画'])));

      render(<VideoList />);

      expect(await screen.findByText('お気に入り動画')).toBeInTheDocument();
      const urls = listCallUrls(fetchMock);
      expect(urls).toHaveLength(1);
      expect(urls[0]).toContain('isFavorite=true');
      expect(screen.getByTestId('favorite-filter')).toHaveTextContent('true');
    });

    it('skip / search / offset も URL の値で最初の取得に反映される', async () => {
      mockSearchParams = new URLSearchParams('skip=false&search=テスト&offset=40');
      const { fetchMock } = mockDeferredFetch();
      fetchMock.mockImplementation(async () => okResponse(createResponse(['動画'], 40)));

      render(<VideoList />);

      await screen.findByText('動画');
      const urls = listCallUrls(fetchMock);
      expect(urls).toHaveLength(1);
      const params = new URL(urls[0], 'http://localhost').searchParams;
      expect(params.get('isSkip')).toBe('false');
      expect(params.get('search')).toBe('テスト');
      expect(params.get('offset')).toBe('40');
      expect(params.get('isFavorite')).toBeNull();
    });

    it('URL に値が無ければ絞り込み無しで取得する', async () => {
      const { fetchMock } = mockDeferredFetch();
      fetchMock.mockImplementation(async () => okResponse(createResponse(['動画'])));

      render(<VideoList />);

      await screen.findByText('動画');
      const urls = listCallUrls(fetchMock);
      expect(urls).toEqual(['/api/videos?limit=20&offset=0']);
    });

    it('取得中は読み込み表示になる', async () => {
      mockDeferredFetch();

      render(<VideoList />);

      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    });
  });

  describe('古い応答の破棄', () => {
    it('先に投げた取得の応答が後から届いても表示が上書きされない', async () => {
      mockSearchParams = new URLSearchParams('favorite=true');
      const { calls } = mockDeferredFetch();

      const { rerender } = render(<VideoList />);
      expect(calls).toHaveLength(1);

      // フィルターを変えて 2 件目の取得を開始する
      mockSearchParams = new URLSearchParams('favorite=false');
      rerender(<VideoList />);
      await waitFor(() => expect(calls).toHaveLength(2));

      // 新しい取得が先に届き、その後で古い取得の応答が届く
      await act(async () => {
        calls[1].resolve(okResponse(createResponse(['新しい結果'])));
      });
      expect(await screen.findByText('新しい結果')).toBeInTheDocument();

      await act(async () => {
        calls[0].resolve(okResponse(createResponse(['古い結果'])));
      });

      expect(screen.getByText('新しい結果')).toBeInTheDocument();
      expect(screen.queryByText('古い結果')).not.toBeInTheDocument();
      expect(screen.getByTestId('favorite-filter')).toHaveTextContent('false');
    });

    it('新しい取得を始めると前の取得の signal が中止される', async () => {
      mockSearchParams = new URLSearchParams('favorite=true');
      const { calls } = mockDeferredFetch();

      const { rerender } = render(<VideoList />);
      expect(calls[0].signal?.aborted).toBe(false);

      mockSearchParams = new URLSearchParams('favorite=false');
      rerender(<VideoList />);
      await waitFor(() => expect(calls).toHaveLength(2));

      expect(calls[0].signal?.aborted).toBe(true);
      expect(calls[1].signal?.aborted).toBe(false);
    });

    it('アンマウント時に実行中の取得が中止される', async () => {
      const { calls } = mockDeferredFetch();

      const { unmount } = render(<VideoList />);
      expect(calls[0].signal?.aborted).toBe(false);

      unmount();

      expect(calls[0].signal?.aborted).toBe(true);
    });

    it('中止された取得ではエラー表示が出ず、新しい取得中の読み込み表示も消えない', async () => {
      mockSearchParams = new URLSearchParams('favorite=true');
      const { calls } = mockDeferredFetch();

      // 実際の fetch と同様に、中止されたら AbortError で reject する
      const { rerender } = render(<VideoList />);
      const first = calls[0];
      first.signal?.addEventListener('abort', () => {
        first.reject(new DOMException('The operation was aborted.', 'AbortError'));
      });

      mockSearchParams = new URLSearchParams('favorite=false');
      rerender(<VideoList />);
      await waitFor(() => expect(calls).toHaveLength(2));
      await act(async () => {
        await first.promise.catch(() => undefined);
      });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      // 2 件目はまだ取得中。初回表示なので読み込み表示のまま
      expect(screen.getByTestId('loading-state')).toBeInTheDocument();

      await act(async () => {
        calls[1].resolve(okResponse(createResponse(['新しい結果'])));
      });
      expect(await screen.findByText('新しい結果')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('中止された古い取得が失敗しても、取得済みの表示にエラーを重ねない', async () => {
      const { calls } = mockDeferredFetch();

      const { rerender } = render(<VideoList />);
      mockSearchParams = new URLSearchParams('favorite=true');
      rerender(<VideoList />);
      await waitFor(() => expect(calls).toHaveLength(2));

      await act(async () => {
        calls[1].resolve(okResponse(createResponse(['新しい結果'])));
      });
      await screen.findByText('新しい結果');

      // signal を無視する実装の fetch が、中止後に通常のエラーで失敗する場合
      await act(async () => {
        calls[0].reject(new Error('古い取得の失敗'));
        await calls[0].promise.catch(() => undefined);
      });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('新しい結果')).toBeInTheDocument();
    });
  });

  describe('URL との同期', () => {
    it('ブラウザバック等で URL が変わると、その値で取得し直す', async () => {
      const { fetchMock } = mockDeferredFetch();
      fetchMock.mockImplementation(async () => okResponse(createResponse(['動画'])));

      const { rerender } = render(<VideoList />);
      await screen.findByText('動画');

      mockSearchParams = new URLSearchParams('favorite=true&skip=true&search=abc&offset=20');
      rerender(<VideoList />);

      await waitFor(() => expect(listCallUrls(fetchMock)).toHaveLength(2));
      const params = new URL(listCallUrls(fetchMock)[1], 'http://localhost').searchParams;
      expect(params.get('isFavorite')).toBe('true');
      expect(params.get('isSkip')).toBe('true');
      expect(params.get('search')).toBe('abc');
      expect(params.get('offset')).toBe('20');
      expect(screen.getByTestId('skip-filter')).toHaveTextContent('true');
      expect(screen.getByTestId('search-keyword')).toHaveTextContent('abc');
    });
  });

  describe('エラー表示', () => {
    it('応答が ok でなければエラーを表示し、閉じられる', async () => {
      global.fetch = jest.fn(async () => ({ ok: false }) as Response) as unknown as typeof fetch;

      render(<VideoList />);

      expect(await screen.findByRole('alert')).toHaveTextContent('動画一覧の取得に失敗しました');
      fireEvent.click(screen.getByText('閉じる'));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('Error 以外で失敗した場合はネットワークエラーのメッセージを表示する', async () => {
      global.fetch = jest.fn(async () => {
        throw 'network';
      }) as unknown as typeof fetch;

      render(<VideoList />);

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });
  });

  describe('一覧の表示', () => {
    it('0 件のときは空の表示になる', async () => {
      global.fetch = jest.fn(async () => okResponse(createResponse([]))) as unknown as typeof fetch;

      render(<VideoList />);

      expect(await screen.findByText('動画が見つかりませんでした')).toBeInTheDocument();
    });
  });

  describe('操作', () => {
    const setup = async () => {
      const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith('/api/videos/') && init?.method === 'PUT') {
          return { ok: true } as Response;
        }
        return okResponse(createResponse(['動画']));
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      render(<VideoList />);
      await screen.findByText('動画');
      return fetchMock;
    };

    it('お気に入りを切り替えると設定を更新して一覧を再取得する', async () => {
      const fetchMock = await setup();

      fireEvent.click(screen.getByText('お気に入り'));

      await waitFor(() => expect(listCallUrls(fetchMock)).toHaveLength(2));
      const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
      expect(putCall?.[1]?.body).toBe(JSON.stringify({ isFavorite: true }));
    });

    it('スキップを切り替えると設定を更新して一覧を再取得する', async () => {
      const fetchMock = await setup();

      fireEvent.click(screen.getByText('スキップ'));

      await waitFor(() => expect(listCallUrls(fetchMock)).toHaveLength(2));
      const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
      expect(putCall?.[1]?.body).toBe(JSON.stringify({ isSkip: true }));
    });

    it('お気に入りの更新に失敗するとエラーを表示する', async () => {
      global.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'PUT' ? ({ ok: false } as Response) : okResponse(createResponse(['動画']))
      ) as unknown as typeof fetch;
      render(<VideoList />);
      await screen.findByText('動画');

      fireEvent.click(screen.getByText('お気に入り'));

      expect(await screen.findByRole('alert')).toHaveTextContent('お気に入りの更新に失敗しました');
    });

    it('スキップの更新に失敗するとエラーを表示する', async () => {
      global.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'PUT' ? ({ ok: false } as Response) : okResponse(createResponse(['動画']))
      ) as unknown as typeof fetch;
      render(<VideoList />);
      await screen.findByText('動画');

      fireEvent.click(screen.getByText('スキップ'));

      expect(await screen.findByRole('alert')).toHaveTextContent('スキップの更新に失敗しました');
    });

    it('更新に失敗した例外が Error でなくても既定のメッセージを表示する', async () => {
      global.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          throw 'network';
        }
        return okResponse(createResponse(['動画']));
      }) as unknown as typeof fetch;
      render(<VideoList />);
      await screen.findByText('動画');

      fireEvent.click(screen.getByText('お気に入り'));
      expect(await screen.findByRole('alert')).toHaveTextContent('お気に入りの更新に失敗しました');
      fireEvent.click(screen.getByText('閉じる'));

      fireEvent.click(screen.getByText('スキップ'));
      expect(await screen.findByRole('alert')).toHaveTextContent('スキップの更新に失敗しました');
    });

    describe('お気に入り・スキップの楽観的な更新', () => {
      const putCalls = (fetchMock: jest.Mock) =>
        fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');

      /** PUT の応答をテスト側で制御し、一覧の取得は即座に返す */
      const setupWithDeferredPut = async () => {
        let resolvePut!: (response: Response) => void;
        const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method === 'PUT') {
            return new Promise<Response>((resolve) => {
              resolvePut = resolve;
            });
          }
          return Promise.resolve(okResponse(createResponse(['動画'])));
        });
        global.fetch = fetchMock as unknown as typeof fetch;
        render(<VideoList />);
        await screen.findByText('動画');
        return { fetchMock, resolvePut: (response: Response) => resolvePut(response) };
      };

      it('お気に入りを押した直後に、PUT の完了を待たず表示が切り替わる', async () => {
        await setupWithDeferredPut();
        expect(screen.getByText('お気に入り')).toHaveAttribute('data-favorite', 'false');

        fireEvent.click(screen.getByText('お気に入り'));

        expect(screen.getByText('お気に入り')).toHaveAttribute('data-favorite', 'true');
      });

      it('お気に入りの送信中はその動画のボタンが無効になり、押しても PUT は 1 回だけ', async () => {
        const { fetchMock, resolvePut } = await setupWithDeferredPut();

        fireEvent.click(screen.getByText('お気に入り'));
        fireEvent.click(screen.getByText('お気に入り'));
        fireEvent.click(screen.getByText('お気に入り'));

        expect(screen.getByText('お気に入り')).toBeDisabled();
        expect(screen.getByText('スキップ')).toBeDisabled();
        expect(putCalls(fetchMock)).toHaveLength(1);
        expect(putCalls(fetchMock)[0][1]?.body).toBe(JSON.stringify({ isFavorite: true }));

        await act(async () => {
          resolvePut({ ok: true } as Response);
        });
        await waitFor(() => expect(screen.getByText('お気に入り')).not.toBeDisabled());
      });

      it('お気に入りの送信中は同じ動画のスキップも送らない', async () => {
        const { fetchMock, resolvePut } = await setupWithDeferredPut();

        fireEvent.click(screen.getByText('お気に入り'));
        fireEvent.click(screen.getByText('スキップ'));

        expect(putCalls(fetchMock)).toHaveLength(1);
        expect(screen.getByText('スキップ')).toHaveAttribute('data-skip', 'false');

        await act(async () => {
          resolvePut({ ok: true } as Response);
        });
        await waitFor(() => expect(screen.getByText('スキップ')).not.toBeDisabled());
      });

      it('送信が終わったあとにもう一度押すと、OFF の更新が送られる', async () => {
        // サーバー側の値を持ち、PUT で更新された値を一覧の取得で返す
        let serverFavorite = false;
        const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method === 'PUT') {
            serverFavorite = JSON.parse(String(init.body)).isFavorite;
            return { ok: true } as Response;
          }
          const body = createResponse(['動画']);
          body.videos[0].userSetting = {
            videoId: 'sm0',
            isFavorite: serverFavorite,
            isSkip: false,
            createdAt: 0,
            updatedAt: 0,
          };
          return okResponse(body);
        });
        global.fetch = fetchMock as unknown as typeof fetch;
        render(<VideoList />);
        await screen.findByText('動画');

        fireEvent.click(screen.getByText('お気に入り'));
        await waitFor(() => expect(screen.getByText('お気に入り')).not.toBeDisabled());
        expect(screen.getByText('お気に入り')).toHaveAttribute('data-favorite', 'true');

        fireEvent.click(screen.getByText('お気に入り'));
        await waitFor(() => expect(screen.getByText('お気に入り')).not.toBeDisabled());

        expect(putCalls(fetchMock).map(([, init]) => init?.body)).toEqual([
          JSON.stringify({ isFavorite: true }),
          JSON.stringify({ isFavorite: false }),
        ]);
        expect(screen.getByText('お気に入り')).toHaveAttribute('data-favorite', 'false');
      });

      it('お気に入りの更新に失敗すると元の表示に戻り、エラーを表示する', async () => {
        const { resolvePut } = await setupWithDeferredPut();

        fireEvent.click(screen.getByText('お気に入り'));
        expect(screen.getByText('お気に入り')).toHaveAttribute('data-favorite', 'true');

        await act(async () => {
          resolvePut({ ok: false } as Response);
        });

        expect(await screen.findByRole('alert')).toHaveTextContent(
          'お気に入りの更新に失敗しました'
        );
        expect(screen.getByText('お気に入り')).toHaveAttribute('data-favorite', 'false');
        expect(screen.getByText('お気に入り')).not.toBeDisabled();
      });

      it('スキップを押した直後に表示が切り替わり、送信中は PUT が 1 回だけになる', async () => {
        const { fetchMock, resolvePut } = await setupWithDeferredPut();

        fireEvent.click(screen.getByText('スキップ'));
        fireEvent.click(screen.getByText('スキップ'));

        expect(screen.getByText('スキップ')).toHaveAttribute('data-skip', 'true');
        expect(screen.getByText('スキップ')).toBeDisabled();
        expect(screen.getByText('お気に入り')).toBeDisabled();
        expect(putCalls(fetchMock)).toHaveLength(1);
        expect(putCalls(fetchMock)[0][1]?.body).toBe(JSON.stringify({ isSkip: true }));

        await act(async () => {
          resolvePut({ ok: true } as Response);
        });
        await waitFor(() => expect(screen.getByText('スキップ')).not.toBeDisabled());
      });

      it('スキップの更新に失敗すると元の表示に戻り、エラーを表示する', async () => {
        const { resolvePut } = await setupWithDeferredPut();

        fireEvent.click(screen.getByText('スキップ'));
        expect(screen.getByText('スキップ')).toHaveAttribute('data-skip', 'true');

        await act(async () => {
          resolvePut({ ok: false } as Response);
        });

        expect(await screen.findByRole('alert')).toHaveTextContent('スキップの更新に失敗しました');
        expect(screen.getByText('スキップ')).toHaveAttribute('data-skip', 'false');
        expect(screen.getByText('スキップ')).not.toBeDisabled();
      });

      it('別の動画の更新は、送信中の動画に影響されず送れる', async () => {
        const puts: Array<(response: Response) => void> = [];
        const fetchMock = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method === 'PUT') {
            return new Promise<Response>((resolve) => puts.push(resolve));
          }
          return Promise.resolve(okResponse(createResponse(['動画A', '動画B'])));
        });
        global.fetch = fetchMock as unknown as typeof fetch;
        render(<VideoList />);
        await screen.findByText('動画A');

        const [firstCard, secondCard] = screen.getAllByTestId('video-card');
        fireEvent.click(within(firstCard).getByText('お気に入り'));
        fireEvent.click(within(secondCard).getByText('お気に入り'));

        expect(within(firstCard).getByText('お気に入り')).toBeDisabled();
        expect(within(secondCard).getByText('お気に入り')).toBeDisabled();
        expect(putCalls(fetchMock)).toHaveLength(2);

        await act(async () => {
          puts.forEach((resolve) => resolve({ ok: true } as Response));
        });
      });
    });

    it('フィルター・検索・ページ変更で URL を更新する', async () => {
      mockSearchParams = new URLSearchParams('favorite=true&skip=false&search=abc');
      await setup();

      fireEvent.click(screen.getByText('お気に入りに変更'));
      expect(mockPush).toHaveBeenLastCalledWith('/mylist?favorite=true&skip=false&search=abc', {
        scroll: false,
      });

      fireEvent.click(screen.getByText('スキップに変更'));
      expect(mockPush).toHaveBeenLastCalledWith('/mylist?favorite=true&skip=true&search=abc', {
        scroll: false,
      });

      fireEvent.click(screen.getByText('検索'));
      expect(mockPush).toHaveBeenLastCalledWith(
        `/mylist?${new URLSearchParams({ favorite: 'true', skip: 'false', search: 'キーワード' })}`,
        { scroll: false }
      );

      fireEvent.click(screen.getByText('次のページ'));
      expect(mockPush).toHaveBeenLastCalledWith(
        '/mylist?favorite=true&skip=false&search=abc&offset=20',
        { scroll: false }
      );
      expect(window.scrollTo).toHaveBeenCalled();
    });

    it('URL に他の絞り込みが無ければ検索語だけを付けて遷移する', async () => {
      await setup();

      fireEvent.click(screen.getByText('検索'));

      expect(mockPush).toHaveBeenLastCalledWith(
        `/mylist?${new URLSearchParams({ search: 'キーワード' })}`,
        { scroll: false }
      );
    });

    it('詳細モーダルを開閉でき、更新時は一覧を再取得する', async () => {
      const fetchMock = await setup();

      fireEvent.click(screen.getByText('詳細'));
      expect(screen.getByTestId('detail-modal')).toHaveTextContent('sm0');

      fireEvent.click(screen.getByText('モーダル更新'));
      await waitFor(() => expect(listCallUrls(fetchMock)).toHaveLength(2));

      fireEvent.click(screen.getByText('モーダルを閉じる'));
      expect(screen.queryByTestId('detail-modal')).not.toBeInTheDocument();
    });
  });
});
