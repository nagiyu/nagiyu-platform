import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Home from '@/app/page';
import { getVideoDurationSec } from '@/lib/get-video-duration';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/lib/get-video-duration', () => ({
  getVideoDurationSec: jest.fn(),
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
    (getVideoDurationSec as jest.Mock).mockResolvedValue(undefined);

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

  it('動画の尺が取得できた場合はdurationSecをリクエストボディに含める', async () => {
    (getVideoDurationSec as jest.Mock).mockResolvedValue(123.45);
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
      expect(mockFetch).toHaveBeenCalled();
    });

    const requestInit = mockFetch.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(requestInit.body)).toEqual(expect.objectContaining({ durationSec: 123.45 }));
  });

  it('動画の尺が取得できなかった場合はdurationSecをリクエストボディに含めない', async () => {
    (getVideoDurationSec as jest.Mock).mockResolvedValue(undefined);
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
      expect(mockFetch).toHaveBeenCalled();
    });

    const requestInit = mockFetch.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(requestInit.body)).not.toHaveProperty('durationSec');
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

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    // ボタンラベルがアップロード中表示に変わり、disabled になっていることを確認
    expect(screen.getByRole('button', { name: 'アップロード中... 0%' })).toBeDisabled();
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
      // ボタンラベルが 50% 表示に更新されることを確認
      expect(screen.getByRole('button', { name: 'アップロード中... 50%' })).toBeDisabled();
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

  it('multipart分割アップロード時にチャンクごとに進捗が更新される', async () => {
    // 2チャンク構成: fetchが2回呼ばれ、complete-uploadが呼ばれて遷移することを確認
    const file = new File(['x'.repeat(10)], 'input.mp4', { type: 'video/mp4' });
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobId: 'job-1',
          multipart: {
            uploadId: 'upload-1',
            uploadUrls: ['https://example.com/upload/1', 'https://example.com/upload/2'],
            chunkSize: 5,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '"etag-1"' },
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '"etag-2"' },
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
      // 両チャンクのPUTが呼ばれたことを確認
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://example.com/upload/1',
        expect.objectContaining({ method: 'PUT' })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://example.com/upload/2',
        expect.objectContaining({ method: 'PUT' })
      );
      // 全チャンク完了後に100%に達して遷移することを確認
      expect(mockPush).toHaveBeenCalledWith('/jobs/job-1');
    });
  });

  it('multipart分割アップロード: 1チャンクの場合は完了時に100%になる', async () => {
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
        headers: { get: () => '"etag-1"' },
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
      expect(mockPush).toHaveBeenCalledWith('/jobs/job-1');
    });
  });
  describe('ジョブ作成の失敗理由の表示', () => {
    it('サーバーが message を返した場合はその文言を表示する', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'INVALID_FILE_TYPE',
          message: 'MP4 形式の動画ファイルのみアップロードできます',
        }),
      }) as jest.Mock;

      render(<Home />);
      selectFile();
      fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));

      await waitFor(() => {
        expect(
          screen.getByText('MP4 形式の動画ファイルのみアップロードできます')
        ).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).not.toBeDisabled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it.each([
      ['本文が JSON として読めない', () => Promise.reject(new SyntaxError('invalid json'))],
      ['message が無い', () => Promise.resolve({ error: 'X' })],
      ['message が空文字', () => Promise.resolve({ message: '' })],
      ['message が文字列でない', () => Promise.resolve({ message: 123 })],
      ['本文が null', () => Promise.resolve(null)],
    ])('%s場合は固定文言を表示する', async (_label, json) => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        json,
      }) as jest.Mock;

      render(<Home />);
      selectFile();
      fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));

      await waitFor(() => {
        expect(screen.getByText('アップロード処理の開始に失敗しました')).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('ファイル選択時の検証', () => {
    const selectCustomFile = (file: File) => {
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [file] } });
    };

    it('MP4 以外を選択するとエラーを表示しアップロードボタンを無効化する', () => {
      render(<Home />);

      selectCustomFile(new File(['dummy'], 'input.mov', { type: 'video/quicktime' }));

      expect(
        screen.getByText('MP4 形式の動画ファイルのみアップロードできます')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
    });

    it('Content-Type が video/mp4 以外なら拡張子が .mp4 でも不正として扱う', () => {
      render(<Home />);

      selectCustomFile(new File(['dummy'], 'input.mp4', { type: 'video/quicktime' }));

      expect(
        screen.getByText('MP4 形式の動画ファイルのみアップロードできます')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
    });

    it('サイズが 0 のファイルを選択するとサイズのエラーを表示しボタンを無効化する', () => {
      render(<Home />);

      selectCustomFile(new File([], 'input.mp4', { type: 'video/mp4' }));

      expect(screen.getByText('ファイルサイズが不正です')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
    });

    it('上限を超えるサイズのファイルを選択するとサイズのエラーを表示しボタンを無効化する', () => {
      render(<Home />);

      const file = new File(['dummy'], 'input.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 20 * 1024 * 1024 * 1024 + 1 });
      selectCustomFile(file);

      expect(screen.getByText('ファイルサイズが不正です')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
    });

    it('ドロップした不正なファイルでもエラーを表示しボタンを無効化する', () => {
      render(<Home />);

      const dropZone = screen.getByRole('button', { name: '動画ファイルを選択' });
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [new File(['dummy'], 'input.avi', { type: 'video/x-msvideo' })] },
      });

      expect(
        screen.getByText('MP4 形式の動画ファイルのみアップロードできます')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
    });

    it('不正なファイルは送信されない', () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch as jest.Mock;
      render(<Home />);

      selectCustomFile(new File(['dummy'], 'input.mov', { type: 'video/quicktime' }));
      fireEvent.submit(document.querySelector('form') as HTMLFormElement);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(
        screen.getByText('MP4 形式の動画ファイルのみアップロードできます')
      ).toBeInTheDocument();
    });

    it('正しいファイルを選び直すとエラーが消えボタンが有効になる', () => {
      render(<Home />);

      selectCustomFile(new File(['dummy'], 'input.mov', { type: 'video/quicktime' }));
      expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();

      selectFile();

      expect(
        screen.queryByText('MP4 形式の動画ファイルのみアップロードできます')
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).not.toBeDisabled();
    });

    it('ブラウザが type を空にする .mp4 は有効とし、contentType を送らない', async () => {
      const mockFetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobId: 'job-1', uploadUrl: 'https://example.com/upload' }),
      });
      global.fetch = mockFetch as jest.Mock;
      render(<Home />);

      selectCustomFile(new File(['dummy'], 'input.mp4', { type: '' }));
      expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).not.toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
      const requestInit = mockFetch.mock.calls[0]?.[1] as { body: string };
      expect(JSON.parse(requestInit.body)).not.toHaveProperty('contentType');
    });
  });
});
