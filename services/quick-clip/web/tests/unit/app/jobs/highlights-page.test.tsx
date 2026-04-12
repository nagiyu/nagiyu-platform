import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import HighlightsPage from '@/app/jobs/[jobId]/highlights/page';
import { clearSelectedIdIfHighlightMatches } from '@/app/jobs/[jobId]/highlights/selection';

describe('HighlightsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
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
    global.fetch = jest
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
      }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('#1'));

    const retryButton = await screen.findByRole('button', { name: 'リトライ' });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
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
    global.fetch = jest
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
      }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('#1'));

    const acceptedRadio = await screen.findByRole('radio', { name: '使える' });
    fireEvent.click(acceptedRadio);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
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

    global.fetch = jest
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
      }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    jest.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('PENDING がある間は 3 秒ごとにポーリングする', async () => {
    jest.useFakeTimers();

    global.fetch = jest
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
      }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    jest.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
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

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    jest.advanceTimersByTime(6000);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('時刻入力中は PATCH を呼ばず、blur 時にのみ呼び出す', async () => {
    global.fetch = jest
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
      }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('#1'));

    const startInputs = await screen.findAllByRole('spinbutton');
    fireEvent.change(startInputs[0], { target: { value: '11' } });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    fireEvent.blur(startInputs[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        '/api/jobs/job-1/highlights/h-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  it('開始時刻が終了時刻以上の入力はエラー表示し、PATCHを呼ばない', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
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

    const startInputs = await screen.findAllByRole('spinbutton');
    fireEvent.change(startInputs[0], { target: { value: '20' } });
    fireEvent.blur(startInputs[0]);

    await waitFor(() => {
      expect(screen.getByText('開始時刻は終了時刻より小さくしてください')).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('時刻更新API失敗時は入力値を元に戻し、更新失敗メッセージを表示する', async () => {
    global.fetch = jest
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
      }) as jest.Mock;

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
      expect(global.fetch).toHaveBeenCalledTimes(2);
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

    global.fetch = jest
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
      }) as jest.Mock;

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
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(screen.getByLabelText('見どころ動画プレビュー')).toHaveAttribute(
        'src',
        'https://example.com/h-1-url-1.mp4'
      );
    });
  });

  it('時刻調整後にポーリングで即 GENERATED が返った場合、新しいクリップ URL を video src に反映する', async () => {
    jest.useFakeTimers();

    global.fetch = jest
      .fn()
      // Initial load: h-1 is GENERATED with old URL
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
              clipUrl: 'https://example.com/h-1-old.mp4',
            },
          ],
        }),
      })
      // PATCH: time range update → returns GENERATING
      .mockResolvedValueOnce({
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
      })
      // Poll: regeneration finished quickly, returns GENERATED with new URL
      .mockResolvedValueOnce({
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
      }) as jest.Mock;

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
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(screen.getByText('クリップ生成中...')).toBeInTheDocument();
      expect(screen.queryByLabelText('見どころ動画プレビュー')).not.toBeInTheDocument();
    });

    // Advance timer to trigger polling
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // After polling returns GENERATED with new URL, video should show new URL
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(screen.getByLabelText('見どころ動画プレビュー')).toHaveAttribute(
        'src',
        'https://example.com/h-1-new.mp4'
      );
    });
  });

  it('GENERATING から GENERATED に遷移したクリップの clipUrl を選択時の video src に反映する', async () => {
    jest.useFakeTimers();

    global.fetch = jest
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
      expect(global.fetch).toHaveBeenCalledTimes(2);
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
