import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import HighlightsPage from '@/app/jobs/[jobId]/highlights/page';

describe('HighlightsPage', () => {
  const originalLoad = HTMLMediaElement.prototype.load;

  beforeEach(() => {
    jest.clearAllMocks();
    HTMLMediaElement.prototype.load = jest.fn();
  });

  afterEach(() => {
    HTMLMediaElement.prototype.load = originalLoad;
  });

  it('見どころ取得時に previewUrl を video 要素へ反映する', async () => {
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
            status: 'accepted',
            previewUrl: 'https://example.com/preview-h-1.mp4',
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
      'https://example.com/preview-h-1.mp4'
    );
  });

  it('previewUrl が無い場合は video 要素の src を設定しない', async () => {
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
            status: 'accepted',
          },
        ],
      }),
    }) as jest.Mock;

    render(<HighlightsPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('採用中の見どころ: 1 件')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('見どころ動画プレビュー')).not.toHaveAttribute('src');
  });
});
