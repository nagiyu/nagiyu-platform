import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Home from '@/app/page';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

type MockXHR = {
  open: jest.Mock;
  setRequestHeader: jest.Mock;
  send: jest.Mock;
  upload: { onprogress: ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  status: number;
};

describe('Home', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let mockXHR: MockXHR;

  const selectFile = () => {
    const file = new File(['dummy'], 'input.mp4', { type: 'video/mp4' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    return file;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockXHR = {
      open: jest.fn(),
      setRequestHeader: jest.fn(),
      send: jest.fn(),
      upload: { onprogress: null },
      onload: null,
      onerror: null,
      status: 200,
    };
    global.XMLHttpRequest = jest.fn(() => mockXHR) as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('アップロード画面の主要要素を表示する', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { level: 1, name: 'さくっとクリップ' })).toBeInTheDocument();
    expect(
      screen.getByText('動画をアップロードして見どころ抽出を開始します。')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
  });

  it('制約通知 Alert が表示される', () => {
    render(<Home />);

    expect(screen.getByText(/アップロード中はタブを閉じないでください/)).toBeInTheDocument();
    expect(screen.getByText(/データは 24 時間で自動削除されます/)).toBeInTheDocument();
  });

  it('ジョブ作成後に署名付きURLへ動画ファイルをアップロードして遷移する', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobId: 'job-1',
        uploadUrl: 'https://example.com/upload',
      }),
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
      expect(mockXHR.open).toHaveBeenCalledWith('PUT', 'https://example.com/upload');
      expect(mockXHR.send).toHaveBeenCalledWith(file);
    });

    // Simulate XHR success
    act(() => {
      mockXHR.status = 200;
      mockXHR.onload?.();
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/jobs/job-1');
    });
  });

  it('動画アップロードが失敗した場合はエラーを表示して遷移しない', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobId: 'job-1',
        uploadUrl: 'https://example.com/upload',
      }),
    });
    global.fetch = mockFetch as jest.Mock;

    render(<Home />);

    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));

    await waitFor(() => {
      expect(mockXHR.send).toHaveBeenCalled();
    });

    // Simulate XHR failure (non-2xx status)
    act(() => {
      mockXHR.status = 500;
      mockXHR.onload?.();
    });

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

  it('アップロード時に例外が発生した場合はアップロード失敗エラーを表示して遷移しない', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobId: 'job-1',
        uploadUrl: 'https://example.com/upload',
      }),
    });
    global.fetch = mockFetch as jest.Mock;

    render(<Home />);

    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));

    await waitFor(() => {
      expect(mockXHR.send).toHaveBeenCalled();
    });

    // Simulate XHR network error
    act(() => {
      mockXHR.onerror?.();
    });

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

  it('LinearProgress と進捗テキストがアップロード中に表示される', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobId: 'job-1',
        uploadUrl: 'https://example.com/upload',
      }),
    });
    global.fetch = mockFetch as jest.Mock;

    render(<Home />);

    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));

    await waitFor(() => {
      expect(mockXHR.send).toHaveBeenCalled();
    });

    expect(screen.getAllByText('アップロード中... 0%').length).toBeGreaterThan(0);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('XHR progress イベントでプログレスバーが更新される', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobId: 'job-1',
        uploadUrl: 'https://example.com/upload',
      }),
    });
    global.fetch = mockFetch as jest.Mock;

    render(<Home />);

    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));

    await waitFor(() => {
      expect(mockXHR.send).toHaveBeenCalled();
    });

    act(() => {
      mockXHR.upload.onprogress?.(
        new ProgressEvent('progress', { loaded: 50, total: 100, lengthComputable: true })
      );
    });

    await waitFor(() => {
      expect(screen.getAllByText('アップロード中... 50%').length).toBeGreaterThan(0);
    });
  });

  it('multipartレスポンス時は分割アップロード後にcomplete-uploadを呼び出して遷移する', async () => {
    const file = new File(['dummy'], 'input.mp4', { type: 'video/mp4' });
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobId: 'job-1',
          multipart: {
            uploadId: 'upload-1',
            uploadUrls: ['https://example.com/upload/1', 'https://example.com/upload/2'],
            chunkSize: 3,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => '"etag-1"',
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => '"etag-2"',
        },
      })
      .mockResolvedValueOnce({
        ok: true,
      });
    global.fetch = mockFetch as jest.Mock;

    render(<Home />);

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
        'https://example.com/upload/1',
        expect.objectContaining({
          method: 'PUT',
        })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://example.com/upload/2',
        expect.objectContaining({
          method: 'PUT',
        })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        4,
        '/api/jobs/job-1/complete-upload',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
      expect(mockPush).toHaveBeenCalledWith('/jobs/job-1');
    });

    const COMPLETE_UPLOAD_CALL_INDEX = 3;
    const completeUploadRequest = mockFetch.mock.calls[COMPLETE_UPLOAD_CALL_INDEX]?.[1] as {
      body: string;
    };
    expect(JSON.parse(completeUploadRequest.body)).toEqual({
      uploadId: 'upload-1',
      parts: [
        { PartNumber: 1, ETag: '"etag-1"' },
        { PartNumber: 2, ETag: '"etag-2"' },
      ],
    });
  });

  it('multipartレスポンスのchunkSizeが不正な場合はエラーを表示して遷移しない', async () => {
    const file = new File(['dummy'], 'input.mp4', { type: 'video/mp4' });
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobId: 'job-1',
        multipart: {
          uploadId: 'upload-1',
          uploadUrls: ['https://example.com/upload/1'],
          chunkSize: 0,
        },
      }),
    });
    global.fetch = mockFetch as jest.Mock;

    render(<Home />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));

    await waitFor(() => {
      expect(screen.getByText('アップロードパラメータが不正です')).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('multipart完了APIが失敗した場合は専用エラーを表示して遷移しない', async () => {
    const file = new File(['dummy'], 'input.mp4', { type: 'video/mp4' });
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobId: 'job-1',
          multipart: {
            uploadId: 'upload-1',
            uploadUrls: ['https://example.com/upload/1'],
            chunkSize: 5,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => '"etag-1"',
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
    global.fetch = mockFetch as jest.Mock;

    render(<Home />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));

    await waitFor(() => {
      expect(screen.getByText('アップロード完了処理に失敗しました')).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
