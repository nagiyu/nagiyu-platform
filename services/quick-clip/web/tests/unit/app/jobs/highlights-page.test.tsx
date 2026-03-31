import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import HighlightsPage from '@/app/jobs/[jobId]/highlights/page';

describe('HighlightsPage', () => {
  const originalLoad = HTMLMediaElement.prototype.load;
  const originalPause = HTMLMediaElement.prototype.pause;

  beforeEach(() => {
    jest.clearAllMocks();
    HTMLMediaElement.prototype.load = jest.fn();
    HTMLMediaElement.prototype.pause = jest.fn();
  });

  afterEach(() => {
    HTMLMediaElement.prototype.load = originalLoad;
    HTMLMediaElement.prototype.pause = originalPause;
  });

  it('見どころ取得時に元動画URLを video 要素へ反映する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sourceVideoUrl: 'https://example.com/source.mp4',
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            status: 'accepted',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('採用中の見どころ: 1 件')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('見どころ動画プレビュー')).toHaveAttribute(
      'src',
      'https://example.com/source.mp4'
    );
  });

  it('再レンダリング時に同一 jobId で見どころ取得を重複実行しない', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sourceVideoUrl: 'https://example.com/source.mp4',
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            status: 'accepted',
          },
        ],
      }),
    }) as jest.Mock;

    const { rerender } = render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('採用中の見どころ: 1 件')).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    rerender(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('選択区間を超えて再生された場合は終了時刻で停止する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sourceVideoUrl: 'https://example.com/source.mp4',
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            status: 'accepted',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('採用中の見どころ: 1 件')).toBeInTheDocument();
    });

    const video = screen.getByLabelText('見どころ動画プレビュー') as HTMLVideoElement;
    const endSec = 20;
    let currentTime = endSec + 1;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
      },
    });
    fireEvent(video, new Event('timeupdate'));

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
    expect(currentTime).toBe(20);
  });

  it('選択区間の終了時刻ちょうどでもプレビューを停止する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sourceVideoUrl: 'https://example.com/source.mp4',
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            status: 'accepted',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('採用中の見どころ: 1 件')).toBeInTheDocument();
    });

    const video = screen.getByLabelText('見どころ動画プレビュー') as HTMLVideoElement;
    let currentTime = 20;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
      },
    });
    fireEvent(video, new Event('timeupdate'));

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
    expect(currentTime).toBe(20);
  });

  it('選択区間より前へシークした場合は開始時刻まで戻す', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sourceVideoUrl: 'https://example.com/source.mp4',
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            status: 'accepted',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('採用中の見どころ: 1 件')).toBeInTheDocument();
    });

    const video = screen.getByLabelText('見どころ動画プレビュー') as HTMLVideoElement;
    let currentTime = 4;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
      },
    });
    fireEvent(video, new Event('seeking'));

    expect(currentTime).toBe(10);
  });

  it('選択区間より前で timeupdate が発生した場合も開始時刻まで戻す', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sourceVideoUrl: 'https://example.com/source.mp4',
        highlights: [
          {
            highlightId: 'h-1',
            jobId: 'job-1',
            order: 1,
            startSec: 10,
            endSec: 20,
            status: 'accepted',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('採用中の見どころ: 1 件')).toBeInTheDocument();
    });

    const video = screen.getByLabelText('見どころ動画プレビュー') as HTMLVideoElement;
    let currentTime = 4;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
      },
    });
    fireEvent(video, new Event('timeupdate'));

    expect(currentTime).toBe(10);
  });
});
