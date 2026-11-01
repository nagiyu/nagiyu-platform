import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { VideoAd } from '@/app/jobs/[jobId]/VideoAd';
import JobPage from '@/app/jobs/[jobId]/page';

jest.mock('@/app/jobs/[jobId]/VideoAd', () => ({
  VideoAd: jest.fn(),
}));

describe('JobPage', () => {
  beforeEach(() => {
    // デフォルト: VideoAd は即座に onAdFinished を呼ぶ
    (VideoAd as jest.Mock).mockImplementation(({ onAdFinished }: { onAdFinished: () => void }) => {
      React.useEffect(() => {
        onAdFinished();
      }, [onAdFinished]);
      return null;
    });
  });

  it('COMPLETED 状態で見どころ確認ボタンを表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-1',
        status: 'COMPLETED',
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        createdAt: 1700000000000 - 86400000,
        expiresAt: 2,
      }),
    }) as jest.Mock;

    render(<JobPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '見どころを確認する' })).toBeInTheDocument();
    });
  });

  it('広告完了前は COMPLETED でもボタンを表示しない', async () => {
    // VideoAd が onAdFinished を呼ばないモック
    (VideoAd as jest.Mock).mockImplementation(() => <div data-testid="video-ad" />);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-2',
        status: 'COMPLETED',
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        createdAt: 1700000000000 - 86400000,
        expiresAt: 2,
      }),
    }) as jest.Mock;

    render(<JobPage params={Promise.resolve({ jobId: 'job-2' })} />);

    await waitFor(() => {
      expect(screen.getByText('ジョブID: job-2')).toBeInTheDocument();
    });

    expect(screen.queryByRole('link', { name: '見どころを確認する' })).not.toBeInTheDocument();
  });

  it('FAILED 状態では VideoAd を表示しない', async () => {
    // VideoAd が data-testid を持つ要素を返すモック
    (VideoAd as jest.Mock).mockImplementation(() => <div data-testid="video-ad" />);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-3',
        status: 'FAILED',
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        createdAt: 1700000000000 - 86400000,
        expiresAt: 2,
        errorMessage: '処理に失敗しました',
      }),
    }) as jest.Mock;

    render(<JobPage params={Promise.resolve({ jobId: 'job-3' })} />);

    await waitFor(() => {
      expect(screen.getByText('ジョブID: job-3')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('video-ad')).not.toBeInTheDocument();
  });

  it('MUI Stepper が COMPLETED で step 3 まで表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-4',
        status: 'COMPLETED',
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        createdAt: 1700000000000 - 86400000,
        expiresAt: 1700000000000,
      }),
    }) as jest.Mock;

    render(<JobPage params={Promise.resolve({ jobId: 'job-4' })} />);

    await waitFor(() => {
      expect(screen.getByText('アップロード')).toBeInTheDocument();
      expect(screen.getByText('解析')).toBeInTheDocument();
      expect(screen.getByText('切り出し')).toBeInTheDocument();
    });
  });

  it('MUI Stepper が PROCESSING で batchStage サブラベルを表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-5',
        status: 'PROCESSING',
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        createdAt: 1700000000000 - 86400000,
        expiresAt: 1700000000000,
        batchStage: 'analyzing',
      }),
    }) as jest.Mock;

    render(<JobPage params={Promise.resolve({ jobId: 'job-5' })} />);

    await waitFor(() => {
      expect(screen.getByText('解析中')).toBeInTheDocument();
    });
  });

  it('有効期限が表示される', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-6',
        status: 'PROCESSING',
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        createdAt: 1700000000000 - 86400000,
        expiresAt: 1700000000000,
      }),
    }) as jest.Mock;

    render(<JobPage params={Promise.resolve({ jobId: 'job-6' })} />);

    await waitFor(() => {
      expect(screen.getByText(/データの有効期限:/)).toBeInTheDocument();
      // expiresAt はミリ秒として扱う (秒として 1000 倍すると遠い未来の日付になる)
      // 実行環境の TZ に依存せず JST (2023-11-14T22:13:20Z = 2023/11/15 07:13:20) で表示される
      expect(screen.getByText(/2023\/11\/15 07:13:20/)).toBeInTheDocument();
    });
  });

  it('PENDING/PROCESSING 時にタブ閉じ OK 通知が表示される', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-7',
        status: 'PROCESSING',
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        createdAt: 1700000000000 - 86400000,
        expiresAt: 1700000000000,
      }),
    }) as jest.Mock;

    render(<JobPage params={Promise.resolve({ jobId: 'job-7' })} />);

    await waitFor(() => {
      expect(
        screen.getByText('タブを閉じても処理は続きます。URLを控えておくと後で確認できます。')
      ).toBeInTheDocument();
    });
  });

  it('analysisProgress がある場合、解析サブ項目が表示される', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-8',
        status: 'PROCESSING',
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        createdAt: 1700000000000 - 86400000,
        expiresAt: 1700000000000,
        batchStage: 'analyzing',
        analysisProgress: {
          motion: { status: 'done' },
          volume: { status: 'in_progress' },
          transcription: { status: 'in_progress', completed: 1, total: 3 },
        },
      }),
    }) as jest.Mock;

    render(<JobPage params={Promise.resolve({ jobId: 'job-8' })} />);

    await waitFor(() => {
      expect(screen.getByText('モーション解析')).toBeInTheDocument();
      expect(screen.getByText('音量解析')).toBeInTheDocument();
      expect(screen.getByText('文字起こし (1/3)')).toBeInTheDocument();
    });
  });

  it('emotionScoring がある場合、感情分析サブ項目が表示される', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-9',
        status: 'PROCESSING',
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        createdAt: 1700000000000 - 86400000,
        expiresAt: 1700000000000,
        batchStage: 'analyzing',
        analysisProgress: {
          motion: { status: 'done' },
          volume: { status: 'done' },
          transcription: { status: 'done' },
          emotionScoring: { status: 'in_progress' },
        },
      }),
    }) as jest.Mock;

    render(<JobPage params={Promise.resolve({ jobId: 'job-9' })} />);

    await waitFor(() => {
      expect(screen.getByText('感情分析')).toBeInTheDocument();
    });
  });

  it('status が failed の解析項目はスキップ表示になる', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-10',
        status: 'PROCESSING',
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        createdAt: 1700000000000 - 86400000,
        expiresAt: 1700000000000,
        batchStage: 'analyzing',
        analysisProgress: {
          motion: { status: 'done' },
          volume: { status: 'done' },
          transcription: { status: 'failed' },
        },
      }),
    }) as jest.Mock;

    render(<JobPage params={Promise.resolve({ jobId: 'job-10' })} />);

    await waitFor(() => {
      expect(screen.getByText('文字起こし（スキップ）')).toBeInTheDocument();
    });
  });

  const mockJob = (status: string, extra: Record<string, unknown> = {}) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-x',
        status,
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        createdAt: 1,
        expiresAt: 2,
        ...extra,
      }),
    }) as jest.Mock;
  };

  it('見出しは状態によらず「処理状況」で、完了後も「処理中」と出さない', async () => {
    mockJob('COMPLETED');
    render(<JobPage params={Promise.resolve({ jobId: 'job-x' })} />);

    expect(screen.getByRole('heading', { level: 1, name: '処理状況' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('処理完了')).toBeInTheDocument();
    });
    expect(screen.queryByText('処理中')).not.toBeInTheDocument();
  });

  it('状態のチップに Tailwind のクラスを付けず、内容幅にそろえる', async () => {
    mockJob('PROCESSING');
    render(<JobPage params={Promise.resolve({ jobId: 'job-x' })} />);

    const chip = await screen.findByText('処理中');
    expect(chip).not.toHaveClass('w-fit');
    expect(chip.closest('.MuiBox-root')).toHaveStyle({ alignSelf: 'flex-start' });
  });

  it.each(['PENDING', 'PROCESSING'])('%s のあいだスピナーを表示する', async (status) => {
    mockJob(status);
    render(<JobPage params={Promise.resolve({ jobId: 'job-x' })} />);

    await waitFor(() => {
      expect(screen.getByText('ジョブID: job-x')).toBeInTheDocument();
    });
    expect(screen.getByRole('progressbar', { name: '処理中' })).toBeInTheDocument();
  });

  it.each(['COMPLETED', 'FAILED'])('%s ではスピナーを表示しない', async (status) => {
    mockJob(status);
    render(<JobPage params={Promise.resolve({ jobId: 'job-x' })} />);

    await waitFor(() => {
      expect(screen.getByText('ジョブID: job-x')).toBeInTheDocument();
    });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('FAILED のとき解析の段をエラー表示にして「処理失敗」を添える', async () => {
    mockJob('FAILED', { errorMessage: '解析に失敗しました' });
    const { container } = render(<JobPage params={Promise.resolve({ jobId: 'job-x' })} />);

    await waitFor(() => {
      expect(screen.getByText('ジョブID: job-x')).toBeInTheDocument();
    });
    // チップと段の補足の 2 か所に「処理失敗」が出る
    expect(screen.getAllByText('処理失敗')).toHaveLength(2);
    expect(container.querySelectorAll('.MuiStepLabel-label.Mui-error')).toHaveLength(1);
    expect(screen.getByText('解析')).toHaveClass('Mui-error');
  });

  it('FAILED 以外では解析の段をエラー表示にしない', async () => {
    mockJob('PROCESSING', { batchStage: 'analyzing' });
    const { container } = render(<JobPage params={Promise.resolve({ jobId: 'job-x' })} />);

    await waitFor(() => {
      expect(screen.getByText('ジョブID: job-x')).toBeInTheDocument();
    });
    expect(container.querySelectorAll('.Mui-error')).toHaveLength(0);
  });
});
