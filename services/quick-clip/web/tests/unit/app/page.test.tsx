import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Home from '@/app/page';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('Home', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('アップロード画面の主要要素を表示する', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { level: 1, name: 'QuickClip' })).toBeInTheDocument();
    expect(
      screen.getByText('動画をアップロードして見どころ抽出を開始します。')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
  });

  it('ジョブ作成後に署名付きURLへ動画ファイルをアップロードして遷移する', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobId: 'job-1',
          uploadUrl: 'https://example.com/upload',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
      });
    global.fetch = mockFetch as jest.Mock;

    render(<Home />);

    const file = new File(['dummy'], 'input.mp4', { type: 'video/mp4' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        '/api/jobs',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://example.com/upload',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
          },
          body: file,
        })
      );
      expect(mockPush).toHaveBeenCalledWith('/jobs/job-1');
    });
  });
});
