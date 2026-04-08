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
        createdAt: 1,
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
        createdAt: 1,
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
        createdAt: 1,
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
});
