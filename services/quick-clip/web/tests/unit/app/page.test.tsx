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
  let consoleErrorSpy: jest.SpyInstance;

  const selectFile = () => {
    const file = new File(['dummy'], 'input.mp4', { type: 'video/mp4' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    return file;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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

    const file = selectFile();

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

  it('動画アップロードが失敗した場合はエラーを表示して遷移しない', async () => {
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
        ok: false,
      });
    global.fetch = mockFetch as jest.Mock;

    render(<Home />);

    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));

    await waitFor(() => {
      expect(screen.getByText('動画ファイルのアップロードに失敗しました')).toBeInTheDocument();
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('動画アップロードに失敗しました', {
      status: undefined,
    });
    expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).not.toBeDisabled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('アップロード時に例外が発生した場合はアップロード失敗エラーを表示して遷移しない', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobId: 'job-1',
          uploadUrl: 'https://example.com/upload',
        }),
      })
      .mockRejectedValueOnce(new Error('network error'));
    global.fetch = mockFetch as jest.Mock;

    render(<Home />);

    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));

    await waitFor(() => {
      expect(screen.getByText('動画ファイルのアップロードに失敗しました')).toBeInTheDocument();
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '動画アップロード時に予期しないエラーが発生しました',
      expect.any(Error)
    );
    expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).not.toBeDisabled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
