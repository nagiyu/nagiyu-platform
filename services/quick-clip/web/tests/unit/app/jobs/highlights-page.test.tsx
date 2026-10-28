import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import HighlightsPage from '@/app/jobs/[jobId]/highlights/page';
import { clearSelectedIdIfHighlightMatches } from '@/app/jobs/[jobId]/highlights/selection';

/**
 * 復旧 API・有効期限・文字起こしへの呼び出しを、順番に消費するモックから切り離す
 *
 * 一覧・更新の応答を呼び出し順に並べるテストが、これらの呼び出しの分だけずれないようにする。
 */
const withAuxiliaryRoutes = (inner: jest.Mock): jest.Mock =>
  jest.fn((url: string, init?: RequestInit) => {
    if (typeof url === 'string' && url.endsWith('/highlights/recover')) {
      return Promise.resolve({ ok: true, json: async () => ({ recoveredHighlightIds: [] }) });
    }
    if (typeof url === 'string' && url.endsWith('/transcript')) {
      return Promise.resolve({ ok: true, json: async () => ({ segments: [] }) });
    }
    if (url === '/api/jobs/job-1') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'COMPLETED', expiresAt: 0 }),
      });
    }
    return inner(url, init);
  });

// 各テストが差し込む fetch のモックの前に、ジョブ取得の応答を差し込む。
// 見どころ一覧はジョブが COMPLETED と分かってから取るため、既定は COMPLETED を返す
let jobResponse: () => Promise<unknown> = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ status: 'COMPLETED', expiresAt: 0 }),
});
let installedFetch: typeof fetch | undefined;
// モックの呼び出し記録 (回数・引数) を保つため、元のモックを呼んだうえで応答だけ差し替える
Object.defineProperty(global, 'fetch', {
  configurable: true,
  get: () => installedFetch,
  set: (inner: typeof fetch) => {
    installedFetch = new Proxy(inner, {
      apply: (target, thisArg, args: [string, RequestInit?]) => {
        const result = Reflect.apply(target, thisArg, args);
        if (args[0] !== '/api/jobs/job-1') {
          return result;
        }
        // テスト自身がジョブの応答 (status を含む本文) を用意していればそれを使う
        return Promise.resolve(result).then(async (response: { json?: () => Promise<unknown> }) => {
          const body = (await response?.json?.().catch(() => undefined)) as
            { status?: string } | undefined;
          return body?.status ? response : jobResponse();
        });
      },
    });
  },
});

describe('HighlightsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    jobResponse = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'COMPLETED', expiresAt: 0 }),
    });
    // transcript エンドポイントのデフォルトモック（オーバーライドがない場合のフォールバック）
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/transcript')) {
        return { ok: true, json: async () => ({ segments: [] }) };
      }
      return { ok: false };
    }) as jest.Mock;
  });

  it('初期状態は右パネルの一覧を表示し、左パネルはプレースホルダーを表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'unconfirmed',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-1.mp4',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });
    expect(screen.getByText('クリップを選択してください')).toBeInTheDocument();
  });

  it('右パネルの行をクリックすると左パネルに詳細を表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'unconfirmed',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-1.mp4',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('#1'));

    expect(screen.getByLabelText('見どころ動画プレビュー')).toHaveAttribute(
      'src',
      'https://example.com/h-1.mp4'
    );
    expect(screen.getByText('#1 | モーション')).toBeInTheDocument();
  });

  it('GENERATED の clipUrl を video 要素に反映して表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'accepted',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-1.mp4',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('#1'));

    expect(screen.getByLabelText('見どころ動画プレビュー')).toHaveAttribute(
      'src',
      'https://example.com/h-1.mp4'
    );
  });

  it('GENERATING 行クリックで左パネルにローディングを表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'volume',
            status: 'unconfirmed',
            clipStatus: 'GENERATING',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('#1'));

    expect(screen.getByText('クリップ生成中...')).toBeInTheDocument();
    expect(screen.queryByLabelText('見どころ動画プレビュー')).not.toBeInTheDocument();
  });

  it('FAILED 行クリックで左パネルにエラーとリトライボタンを表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'unconfirmed',
            clipStatus: 'FAILED',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('#1'));

    expect(screen.getByText('クリップ生成に失敗しました')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'リトライ' })).toBeInTheDocument();
    expect(screen.queryByLabelText('見どころ動画プレビュー')).not.toBeInTheDocument();
  });

  it('FAILED 時のリトライボタン押下で regenerate API を呼び出す', async () => {
    global.fetch = withAuxiliaryRoutes(
      jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            highlights: [
              {
                highlightId: 'h-1',
                jobId: 'job-1',
                order: 1,
                startSec: 10,
                endSec: 20,
                source: 'motion',
                status: 'unconfirmed',
                clipStatus: 'FAILED',
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'unconfirmed',
            clipStatus: 'GENERATING',
          }),
        })
        .mockResolvedValue({ ok: false }) as jest.Mock
    );

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('#1'));

    const retryButton = await screen.findByRole('button', { name: 'リトライ' });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jobs/job-1/highlights/h-1/regenerate',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('GENERATED 以外の行でも全行クリック可能', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'unconfirmed',
            clipStatus: 'PENDING',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('#1'));

    expect(screen.getByText('クリップ生成中...')).toBeInTheDocument();
  });

  it('右パネルの採否チップを表示する（未確認/使える/使えない）', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'unconfirmed',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-1.mp4',
          },
          {
            highlightId: 'h-2',
            jobId: 'job-1',
            order: 2,
            startSec: 30,
            endSec: 40,
            source: 'volume',
            status: 'accepted',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-2.mp4',
          },
          {
            highlightId: 'h-3',
            jobId: 'job-1',
            order: 3,
            startSec: 50,
            endSec: 60,
            source: 'both',
            status: 'rejected',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-3.mp4',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('未確認')).toBeInTheDocument();
    });
    expect(screen.getByText('使える')).toBeInTheDocument();
    expect(screen.getByText('使えない')).toBeInTheDocument();
  });

  it('左パネルの採否ラジオで status を変更する', async () => {
    global.fetch = withAuxiliaryRoutes(
      jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            highlights: [
              {
                highlightId: 'h-1',
                jobId: 'job-1',
                order: 1,
                startSec: 10,
                endSec: 20,
                source: 'motion',
                status: 'unconfirmed',
                clipStatus: 'GENERATED',
                clipUrl: 'https://example.com/h-1.mp4',
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'accepted',
            clipStatus: 'GENERATED',
          }),
        })
        .mockResolvedValue({ ok: false }) as jest.Mock
    );

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('#1'));

    const acceptedRadio = await screen.findByRole('radio', { name: '使える' });
    fireEvent.click(acceptedRadio);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jobs/job-1/highlights/h-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'accepted' }),
        })
      );
    });
  });

  it('GENERATING がある間は 3 秒ごとにポーリングする', async () => {
    jest.useFakeTimers();

    global.fetch = withAuxiliaryRoutes(
      jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            highlights: [
              {
                highlightId: 'h-1',
                jobId: 'job-1',
                order: 1,
                startSec: 10,
                endSec: 20,
                source: 'motion',
                status: 'unconfirmed',
                clipStatus: 'GENERATING',
              },
            ],
          }),
        })
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            highlights: [
              {
                highlightId: 'h-1',
                jobId: 'job-1',
                order: 1,
                startSec: 10,
                endSec: 20,
                source: 'motion',
                status: 'unconfirmed',
                clipStatus: 'GENERATING',
              },
            ],
          }),
        }) as jest.Mock
    );

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    // recover + highlights + expiresAt + transcript の 4 回
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    jest.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(6);
    });
  });

  it('PENDING がある間は 3 秒ごとにポーリングする', async () => {
    jest.useFakeTimers();

    global.fetch = withAuxiliaryRoutes(
      jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            highlights: [
              {
                highlightId: 'h-1',
                jobId: 'job-1',
                order: 1,
                startSec: 10,
                endSec: 20,
                source: 'motion',
                status: 'unconfirmed',
                clipStatus: 'PENDING',
              },
            ],
          }),
        })
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            highlights: [
              {
                highlightId: 'h-1',
                jobId: 'job-1',
                order: 1,
                startSec: 10,
                endSec: 20,
                source: 'motion',
                status: 'unconfirmed',
                clipStatus: 'PENDING',
              },
            ],
          }),
        }) as jest.Mock
    );

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    // recover + highlights + expiresAt + transcript の 4 回
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    jest.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(6);
    });
  });

  it('PENDING も GENERATING もない場合はポーリングしない', async () => {
    jest.useFakeTimers();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'accepted',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-1.mp4',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    // recover + highlights + expiresAt + transcript の 4 回
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    jest.advanceTimersByTime(6000);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });
  });

  it('時刻入力中は PATCH を呼ばず、blur 時にのみ呼び出す', async () => {
    global.fetch = withAuxiliaryRoutes(
      jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            highlights: [
              {
                highlightId: 'h-1',
                jobId: 'job-1',
                order: 1,
                startSec: 10,
                endSec: 20,
                source: 'motion',
                status: 'accepted',
                clipStatus: 'GENERATED',
                clipUrl: 'https://example.com/h-1.mp4',
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 11,
            endSec: 20,
            status: 'accepted',
            clipStatus: 'GENERATING',
          }),
        })
        .mockResolvedValue({ ok: false }) as jest.Mock
    );

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('#1'));

    const startInputs = await screen.findAllByRole('spinbutton');
    fireEvent.change(startInputs[0], { target: { value: '11' } });

    // recover + highlights + expiresAt + transcript の 4 回（blur 前はPATCHしない）
    expect(global.fetch).toHaveBeenCalledTimes(4);

    fireEvent.blur(startInputs[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(5);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jobs/job-1/highlights/h-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  it('開始時刻が終了時刻以上の入力はエラー表示し、PATCHを呼ばない', async () => {
    global.fetch = withAuxiliaryRoutes(
      jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            highlights: [
              {
                highlightId: 'h-1',
                jobId: 'job-1',
                order: 1,
                startSec: 10,
                endSec: 20,
                source: 'motion',
                status: 'accepted',
                clipStatus: 'GENERATED',
                clipUrl: 'https://example.com/h-1.mp4',
              },
            ],
          }),
        })
        .mockResolvedValue({ ok: false }) as jest.Mock
    );

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('#1'));

    const startInputs = await screen.findAllByRole('spinbutton');
    fireEvent.change(startInputs[0], { target: { value: '20' } });
    fireEvent.blur(startInputs[0]);

    await waitFor(() => {
      expect(screen.getByText('開始時刻は終了時刻より小さくしてください')).toBeInTheDocument();
      // recover + highlights + expiresAt + transcript の 4 回（PATCHなし）
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });
  });

  it('時刻更新API失敗時は入力値を元に戻し、更新失敗メッセージを表示する', async () => {
    global.fetch = withAuxiliaryRoutes(
      jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            highlights: [
              {
                highlightId: 'h-1',
                jobId: 'job-1',
                order: 1,
                startSec: 10,
                endSec: 20,
                source: 'motion',
                status: 'accepted',
                clipStatus: 'GENERATED',
                clipUrl: 'https://example.com/h-1.mp4',
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
        })
        .mockResolvedValue({ ok: false }) as jest.Mock
    );

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('#1'));

    const startInputs = await screen.findAllByRole('spinbutton');
    fireEvent.change(startInputs[0], { target: { value: '11' } });
    fireEvent.blur(startInputs[0]);

    await waitFor(() => {
      expect(screen.getByText('見どころの更新に失敗しました')).toBeInTheDocument();
      expect(startInputs[0]).toHaveValue(10);
      // recover + highlights + expiresAt + transcript + PATCH の 5 回
      expect(global.fetch).toHaveBeenCalledTimes(5);
    });
  });

  describe('ZIP ボタンの無効理由', () => {
    const mockList = (clipStatuses: string[]) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          highlights: clipStatuses.map((clipStatus, index) => ({
            highlightId: `h-${index + 1}`,
            jobId: 'job-1',
            order: index + 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'accepted',
            clipStatus,
          })),
        }),
      }) as jest.Mock;
    };

    it('採用クリップに FAILED があるとき、失敗の理由を表示してボタンを無効にする', async () => {
      mockList(['GENERATED', 'FAILED']);
      render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

      expect(await screen.findByText(/生成に失敗したクリップが採用されています/)).toBeVisible();
      expect(screen.getByRole('button', { name: 'ZIP ダウンロード' })).toBeDisabled();
    });

    it('採用クリップに PENDING/GENERATING があるとき、待つよう理由を表示する', async () => {
      mockList(['GENERATED', 'GENERATING']);
      render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

      expect(await screen.findByText('クリップの生成が終わるまでお待ちください')).toBeVisible();
      expect(screen.getByRole('button', { name: 'ZIP ダウンロード' })).toBeDisabled();
    });

    it('FAILED と GENERATING の両方があるときは失敗の理由を優先する', async () => {
      mockList(['PENDING', 'FAILED']);
      render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

      expect(await screen.findByText(/生成に失敗したクリップが採用されています/)).toBeVisible();
      expect(screen.queryByText('クリップの生成が終わるまでお待ちください')).toBeNull();
    });

    it('すべて GENERATED なら理由を表示せずボタンを有効にする', async () => {
      mockList(['GENERATED']);
      render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'ZIP ダウンロード' })).toBeEnabled();
      });
      expect(screen.queryByText(/生成に失敗したクリップ/)).toBeNull();
      expect(screen.queryByText(/お待ちください/)).toBeNull();
    });
  });

  describe('ジョブの状態による表示', () => {
    const job =
      (status: number, body: unknown = {}) =>
      async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      });

    const installFetch = () => {
      const fetchMock = jest.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/highlights')) {
          return { ok: true, json: async () => ({ highlights: [] }) };
        }
        return { ok: true, json: async () => ({}) };
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
    };

    const requestedUrls = (fetchMock: jest.Mock): string[] =>
      fetchMock.mock.calls.map((call) => call[0] as string);

    it('404 ならジョブが見つからない旨だけを表示し、一覧を取りに行かない', async () => {
      jobResponse = job(404);
      const fetchMock = installFetch();
      render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

      expect(await screen.findByText(COMMON_ERROR_MESSAGES.JOB_NOT_FOUND)).toBeVisible();
      expect(screen.queryByText('見どころが検出されませんでした')).toBeNull();
      expect(requestedUrls(fetchMock).some((url) => url.endsWith('/highlights'))).toBe(false);
      expect(requestedUrls(fetchMock).some((url) => url.endsWith('/recover'))).toBe(false);
    });

    it('404 以外の失敗なら取得失敗だけを表示する', async () => {
      jobResponse = job(500);
      const fetchMock = installFetch();
      render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

      expect(await screen.findByText('ジョブ情報の取得に失敗しました')).toBeVisible();
      expect(screen.queryByText('見どころが検出されませんでした')).toBeNull();
      expect(requestedUrls(fetchMock).some((url) => url.endsWith('/highlights'))).toBe(false);
    });

    it('ジョブ取得が通信エラーでも取得失敗だけを表示する', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      jobResponse = async () => {
        throw new Error('network');
      };
      installFetch();
      render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

      expect(await screen.findByText('ジョブ情報の取得に失敗しました')).toBeVisible();
      warnSpy.mockRestore();
    });

    it.each([
      ['PENDING', 'まだ処理が終わっていません'],
      ['PROCESSING', 'まだ処理が終わっていません'],
      ['FAILED', '処理に失敗しました'],
    ])('%s なら案内と処理中画面へのリンクを表示し、一覧を取りに行かない', async (status, text) => {
      jobResponse = job(200, { status, expiresAt: 0 });
      const fetchMock = installFetch();
      render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

      expect(await screen.findByText(text)).toBeVisible();
      expect(screen.getByRole('link', { name: '処理状況を確認する' })).toHaveAttribute(
        'href',
        '/jobs/job-1'
      );
      expect(screen.queryByText('見どころが検出されませんでした')).toBeNull();
      expect(requestedUrls(fetchMock).some((url) => url.endsWith('/highlights'))).toBe(false);
      expect(requestedUrls(fetchMock).some((url) => url.endsWith('/recover'))).toBe(false);
    });

    it('COMPLETED で 0 件なら「検出されませんでした」を表示する', async () => {
      installFetch();
      render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

      expect(await screen.findByText('見どころが検出されませんでした')).toBeVisible();
    });

    it('一覧の取得に失敗したときは「検出されませんでした」を同時に表示しない', async () => {
      global.fetch = jest.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/highlights')) {
          return { ok: false, status: 500 };
        }
        return { ok: true, json: async () => ({}) };
      }) as unknown as typeof fetch;
      render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

      expect(await screen.findByText('見どころ一覧の取得に失敗しました')).toBeVisible();
      expect(screen.queryByText('見どころが検出されませんでした')).toBeNull();
    });
  });

  it('採用クリップに GENERATED 以外が含まれる場合はダウンロードボタンを無効化する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'accepted',
            clipStatus: 'GENERATING',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ZIP ダウンロード' })).toBeDisabled();
    });
  });

  it('採用0件の場合はダウンロードボタンを無効化する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'unconfirmed',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-1.mp4',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ZIP ダウンロード' })).toBeDisabled();
    });
  });

  it('ポーリング後も選択中 GENERATED クリップの video src を保持する', async () => {
    jest.useFakeTimers();

    global.fetch = withAuxiliaryRoutes(
      jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            highlights: [
              {
                highlightId: 'h-1',
                jobId: 'job-1',
                order: 1,
                startSec: 10,
                endSec: 20,
                source: 'motion',
                status: 'accepted',
                clipStatus: 'GENERATED',
                clipUrl: 'https://example.com/h-1-url-1.mp4',
              },
              {
                highlightId: 'h-2',
                jobId: 'job-1',
                order: 2,
                startSec: 30,
                endSec: 40,
                source: 'volume',
                status: 'accepted',
                clipStatus: 'GENERATING',
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            highlights: [
              {
                highlightId: 'h-1',
                jobId: 'job-1',
                order: 1,
                startSec: 10,
                endSec: 20,
                source: 'motion',
                status: 'accepted',
                clipStatus: 'GENERATED',
                clipUrl: 'https://example.com/h-1-url-2.mp4',
              },
              {
                highlightId: 'h-2',
                jobId: 'job-1',
                order: 2,
                startSec: 30,
                endSec: 40,
                source: 'volume',
                status: 'accepted',
                clipStatus: 'GENERATING',
              },
            ],
          }),
        })
        .mockResolvedValue({ ok: false }) as jest.Mock
    );

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('#1'));

    await waitFor(() => {
      expect(screen.getByLabelText('見どころ動画プレビュー')).toHaveAttribute(
        'src',
        'https://example.com/h-1-url-1.mp4'
      );
    });

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => {
      // 初回 4 回 + ポーリング (recover + highlights) = 6 回
      expect(global.fetch).toHaveBeenCalledTimes(6);
      expect(screen.getByLabelText('見どころ動画プレビュー')).toHaveAttribute(
        'src',
        'https://example.com/h-1-url-1.mp4'
      );
    });
  });

  it('時刻調整後にポーリングで即 GENERATED が返った場合、新しいクリップ URL を video src に反映する', async () => {
    jest.useFakeTimers();

    // URL ベースでレスポンスを振り分ける（呼び出し順序に依存しない方式）
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/transcript')) {
        return { ok: true, json: async () => ({ segments: [] }) };
      }
      return { ok: false };
    }) as jest.Mock;

    // highlights（初回）のみ成功レスポンスを返し、PATCH や poll のために上書き
    let highlightsFetchCount = 0;
    let patchDone = false;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, options?: RequestInit) => {
      if (typeof url === 'string' && url.endsWith('/highlights/recover')) {
        return { ok: true, json: async () => ({ recoveredHighlightIds: [] }) };
      }
      if (typeof url === 'string' && url.includes('/transcript')) {
        return { ok: true, json: async () => ({ segments: [] }) };
      }
      if (
        typeof url === 'string' &&
        url.includes('/api/jobs/job-1/highlights/h-1') &&
        options?.method === 'PATCH'
      ) {
        patchDone = true;
        return {
          ok: true,
          json: async () => ({
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 11,
            endSec: 20,
            source: 'motion',
            status: 'unconfirmed',
            clipStatus: 'GENERATING',
          }),
        };
      }
      if (
        typeof url === 'string' &&
        url.includes('/api/jobs/job-1/highlights') &&
        !url.includes('/h-1')
      ) {
        highlightsFetchCount++;
        if (highlightsFetchCount === 1) {
          return {
            ok: true,
            json: async () => ({
              highlights: [
                {
                  highlightId: 'h-1',
                  jobId: 'job-1',
                  order: 1,
                  startSec: 10,
                  endSec: 20,
                  source: 'motion',
                  status: 'accepted',
                  clipStatus: 'GENERATED',
                  clipUrl: 'https://example.com/h-1-old.mp4',
                },
              ],
            }),
          };
        }
        if (patchDone) {
          return {
            ok: true,
            json: async () => ({
              highlights: [
                {
                  highlightId: 'h-1',
                  jobId: 'job-1',
                  order: 1,
                  startSec: 11,
                  endSec: 20,
                  source: 'motion',
                  status: 'unconfirmed',
                  clipStatus: 'GENERATED',
                  clipUrl: 'https://example.com/h-1-new.mp4',
                },
              ],
            }),
          };
        }
      }
      return { ok: false };
    });

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('#1'));

    await waitFor(() => {
      expect(screen.getByLabelText('見どころ動画プレビュー')).toHaveAttribute(
        'src',
        'https://example.com/h-1-old.mp4'
      );
    });

    // Adjust start time
    const startInputs = screen.getAllByRole('spinbutton');
    fireEvent.change(startInputs[0], { target: { value: '11' } });
    fireEvent.blur(startInputs[0]);

    // After PATCH returns GENERATING, spinner is shown and video is hidden
    await waitFor(() => {
      expect(screen.getByText('クリップ生成中...')).toBeInTheDocument();
      expect(screen.queryByLabelText('見どころ動画プレビュー')).not.toBeInTheDocument();
    });

    // Advance timer to trigger polling
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // After polling returns GENERATED with new URL, video should show new URL
    await waitFor(() => {
      expect(screen.getByLabelText('見どころ動画プレビュー')).toHaveAttribute(
        'src',
        'https://example.com/h-1-new.mp4'
      );
    });
  });

  it('GENERATING から GENERATED に遷移したクリップの clipUrl を選択時の video src に反映する', async () => {
    jest.useFakeTimers();

    // URL ベースでレスポンスを振り分ける（呼び出し順序に依存しない方式）
    let highlightsFetchCount = 0;
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.endsWith('/highlights/recover')) {
        return { ok: true, json: async () => ({ recoveredHighlightIds: [] }) };
      }
      if (typeof url === 'string' && url.includes('/transcript')) {
        return { ok: true, json: async () => ({ segments: [] }) };
      }
      if (
        typeof url === 'string' &&
        url.includes('/api/jobs/job-1/highlights') &&
        !url.includes('/h-')
      ) {
        highlightsFetchCount++;
        if (highlightsFetchCount === 1) {
          return {
            ok: true,
            json: async () => ({
              highlights: [
                {
                  highlightId: 'h-1',
                  jobId: 'job-1',
                  order: 1,
                  startSec: 10,
                  endSec: 20,
                  source: 'motion',
                  status: 'accepted',
                  clipStatus: 'GENERATED',
                  clipUrl: 'https://example.com/h-1.mp4',
                },
                {
                  highlightId: 'h-2',
                  jobId: 'job-1',
                  order: 2,
                  startSec: 30,
                  endSec: 40,
                  source: 'volume',
                  status: 'accepted',
                  clipStatus: 'GENERATING',
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            highlights: [
              {
                highlightId: 'h-1',
                jobId: 'job-1',
                order: 1,
                startSec: 10,
                endSec: 20,
                source: 'motion',
                status: 'accepted',
                clipStatus: 'GENERATED',
                clipUrl: 'https://example.com/h-1.mp4',
              },
              {
                highlightId: 'h-2',
                jobId: 'job-1',
                order: 2,
                startSec: 30,
                endSec: 40,
                source: 'volume',
                status: 'accepted',
                clipStatus: 'GENERATED',
                clipUrl: 'https://example.com/h-2.mp4',
              },
            ],
          }),
        };
      }
      return { ok: false };
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('#1'));

    await waitFor(() => {
      expect(screen.getByLabelText('見どころ動画プレビュー')).toHaveAttribute(
        'src',
        'https://example.com/h-1.mp4'
      );
    });

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => {
      // 初回 4 回 + ポーリング (recover + highlights) = 6 回
      expect(global.fetch).toHaveBeenCalledTimes(6);
    });

    fireEvent.click(screen.getByText('#2'));
    await waitFor(() => {
      expect(screen.getByLabelText('見どころ動画プレビュー')).toHaveAttribute(
        'src',
        'https://example.com/h-2.mp4'
      );
    });
  });
  it('デフォルト状態では抽出根拠列が非表示である', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'unconfirmed',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-1.mp4',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    expect(screen.queryByText('抽出根拠')).not.toBeInTheDocument();
    expect(screen.queryByText('モーション')).not.toBeInTheDocument();
  });

  it('列設定ボタンをクリックするとポップオーバーが開く', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'unconfirmed',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-1.mp4',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '列設定' }));

    expect(screen.getByRole('checkbox', { name: '抽出根拠' })).toBeInTheDocument();
  });

  it('抽出根拠チェックをONにするとテーブルに列が追加される', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'unconfirmed',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-1.mp4',
          },
          {
            highlightId: 'h-2',
            jobId: 'job-1',
            order: 2,
            startSec: 30,
            endSec: 40,
            source: 'volume',
            status: 'accepted',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-2.mp4',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '列設定' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '抽出根拠' }));

    // 抽出根拠ラベルがテーブル本体に表示される（ポップオーバーには存在しない値）
    expect(screen.getByText('モーション')).toBeInTheDocument();
    expect(screen.getByText('音量')).toBeInTheDocument();
  });

  it('抽出根拠チェックをOFFにするとテーブルから列が非表示になる', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'unconfirmed',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-1.mp4',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    // まずONにする
    fireEvent.click(screen.getByRole('button', { name: '列設定' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '抽出根拠' }));
    expect(screen.getByText('モーション')).toBeInTheDocument();

    // 再度クリックしてOFFにする
    fireEvent.click(screen.getByRole('checkbox', { name: '抽出根拠' }));
    expect(screen.queryByText('モーション')).not.toBeInTheDocument();
  });

  it('hasPendingOrGenerating = true のとき「X / Y 件生成済」が表示される', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'unconfirmed',
            clipStatus: 'GENERATED',
          },
          {
            highlightId: 'h-2',
            jobId: 'job-1',
            order: 2,
            startSec: 30,
            endSec: 40,
            source: 'volume',
            status: 'unconfirmed',
            clipStatus: 'PENDING',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('1 / 2 件生成済')).toBeInTheDocument();
    });
  });

  it('hasPendingOrGenerating = false のとき「件生成済」が表示されない', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            source: 'motion',
            status: 'unconfirmed',
            clipStatus: 'GENERATED',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    expect(screen.queryByText(/件生成済/)).not.toBeInTheDocument();
  });

  it('有効期限がフェッチされて表示される', async () => {
    // URL ベースでレスポンスを振り分ける（呼び出し順序に依存しない方式）
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/transcript')) {
        return { ok: true, json: async () => ({ segments: [] }) };
      }
      if (typeof url === 'string' && url.endsWith('/api/jobs/job-1')) {
        return {
          ok: true,
          json: async () => ({
            jobId: 'job-1',
            status: 'COMPLETED',
            expiresAt: 1700000000000,
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          highlights: [
            {
              highlightId: 'h-1',
              jobId: 'job-1',
              order: 1,
              startSec: 10,
              endSec: 20,
              source: 'motion',
              status: 'unconfirmed',
              clipStatus: 'GENERATED',
            },
          ],
        }),
      };
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText(/データの有効期限:/)).toBeInTheDocument();
      // expiresAt はミリ秒として扱う (秒として 1000 倍すると遠い未来の日付になる)
      expect(
        screen.getByText(
          new RegExp(new Date(1700000000000).toLocaleString('ja-JP').replace(/\//g, '\\/'))
        )
      ).toBeInTheDocument();
    });
  });
});

describe('clearSelectedIdIfHighlightMatches', () => {
  it('対象highlightIdと一致するselectedIdをnullにする', () => {
    expect(clearSelectedIdIfHighlightMatches('h-1')('h-1')).toBeNull();
  });

  it('対象highlightIdと一致しないselectedIdは維持する', () => {
    expect(clearSelectedIdIfHighlightMatches('h-1')('h-2')).toBe('h-2');
  });

  it('selectedIdがnullの場合はnullを維持する', () => {
    expect(clearSelectedIdIfHighlightMatches('h-1')(null)).toBeNull();
  });
});
