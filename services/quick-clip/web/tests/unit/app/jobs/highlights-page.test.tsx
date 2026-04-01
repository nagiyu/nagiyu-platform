import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import HighlightsPage from '@/app/jobs/[jobId]/highlights/page';

describe('HighlightsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
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
      expect(screen.getByText('採用中の見どころ: 1 件')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('見どころ動画プレビュー')).toHaveAttribute(
      'src',
      'https://example.com/h-1.mp4'
    );
  });

  it('GENERATING 行ではローディングインジケーターを表示し、クリックしても選択しない', async () => {
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
            status: 'accepted',
            clipStatus: 'GENERATING',
          },
          {
            highlightId: 'h-2',
            jobId: 'job-1',
            order: 2,
            startSec: 30,
            endSec: 40,
            source: 'both',
            status: 'accepted',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-2.mp4',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('採用中の見どころ: 2 件')).toBeInTheDocument();
    });
    expect(screen.getByText('生成中')).toBeInTheDocument();

    const preview = screen.getByLabelText('見どころ動画プレビュー');
    expect(preview).toHaveAttribute('src', 'https://example.com/h-2.mp4');
    fireEvent.click(screen.getByText('#1'));
    expect(preview).toHaveAttribute('src', 'https://example.com/h-2.mp4');
  });

  it('PENDING/GENERATING がある間は 3 秒ごとにポーリングする', async () => {
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
              status: 'accepted',
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

  it('根拠列に抽出根拠のチップを表示する', async () => {
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
          {
            highlightId: 'h-2',
            jobId: 'job-1',
            order: 2,
            startSec: 30,
            endSec: 45,
            source: 'both',
            status: 'accepted',
            clipStatus: 'GENERATED',
            clipUrl: 'https://example.com/h-2.mp4',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('根拠')).toBeInTheDocument();
    });
    expect(screen.getByText('モーション')).toBeInTheDocument();
    expect(screen.getByText('両方')).toBeInTheDocument();
  });
});
