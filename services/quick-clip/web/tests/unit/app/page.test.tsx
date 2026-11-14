import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { formatFileSize } from '@nagiyu/common';
import Home from '@/app/page';
import { AuthUrlProvider } from '@/components/AuthUrlProvider';
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

const AUTH_URL = 'https://auth.example.com';

const HomeWithAuth = () => (
  <AuthUrlProvider authUrl={AUTH_URL}>
    <Home />
  </AuthUrlProvider>
);

type UsageOverrides = Partial<{
  tier: 'anonymous' | 'free' | 'standard' | 'pro';
  remaining: { ai: number; noAi: number };
  maxDurationSec: number;
}>;

const buildUsage = (overrides: UsageOverrides = {}) => ({
  month: '2026-11',
  tier: overrides.tier ?? 'free',
  limits: { aiPerMonth: 1, noAiPerMonth: 10, maxDurationSec: overrides.maxDurationSec ?? 10800 },
  used: { ai: 0, noAi: 0 },
  remaining: overrides.remaining ?? { ai: 1, noAi: 10 },
});

/**
 * /api/usage への取得だけを分けて応答し、それ以外は渡されたモックへ流す。
 * 画面が開いたときの利用状況の取得が、ジョブ作成などの呼び出し順の検証を乱さないようにする。
 */
const withUsage = (inner: jest.Mock, usage: object | 'error' = buildUsage()): jest.Mock =>
  jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (input === '/api/usage') {
      return usage === 'error'
        ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
        : Promise.resolve({ ok: true, status: 200, json: async () => usage });
    }
    return inner(input, init);
  });

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
    global.fetch = withUsage(jest.fn());

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
    render(<HomeWithAuth />);

    expect(screen.getByRole('heading', { level: 1, name: 'さくっとクリップ' })).toBeInTheDocument();
    expect(
      screen.getByText('動画をアップロードして見どころ抽出を開始します。')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
  });

  it('選択中のファイルを名前とサイズで表示する', () => {
    const file = new File([new Uint8Array(2048)], 'input.mp4', { type: 'video/mp4' });
    render(<HomeWithAuth />);
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    });

    expect(screen.getByText(`選択中: input.mp4 (${formatFileSize(2048)})`)).toBeInTheDocument();
  });

  it('制約通知 Alert が表示される', () => {
    render(<HomeWithAuth />);

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
    global.fetch = withUsage(mockFetch);

    render(<HomeWithAuth />);

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
    global.fetch = withUsage(mockFetch);

    render(<HomeWithAuth />);

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
    global.fetch = withUsage(mockFetch);

    render(<HomeWithAuth />);

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
    global.fetch = withUsage(mockFetch);

    render(<HomeWithAuth />);

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
    global.fetch = withUsage(mockFetch);

    render(<HomeWithAuth />);

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
    global.fetch = withUsage(mockFetch);

    render(<HomeWithAuth />);

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
    global.fetch = withUsage(mockFetch);

    render(<HomeWithAuth />);

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
    global.fetch = withUsage(mockFetch);

    render(<HomeWithAuth />);

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
    global.fetch = withUsage(mockFetch);

    render(<HomeWithAuth />);

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
    global.fetch = withUsage(mockFetch);

    render(<HomeWithAuth />);

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
    global.fetch = withUsage(mockFetch);

    render(<HomeWithAuth />);

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
    global.fetch = withUsage(mockFetch);

    render(<HomeWithAuth />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/jobs/job-1');
    });
  });
  describe('ジョブ作成の失敗理由の表示', () => {
    it('サーバーが message を返した場合はその文言を表示する', async () => {
      global.fetch = withUsage(
        jest.fn().mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            error: 'INVALID_FILE_TYPE',
            message: 'MP4 形式の動画ファイルのみアップロードできます',
          }),
        })
      );

      render(<HomeWithAuth />);
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
      global.fetch = withUsage(
        jest.fn().mockResolvedValueOnce({
          ok: false,
          status: 500,
          json,
        })
      );

      render(<HomeWithAuth />);
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
      render(<HomeWithAuth />);

      selectCustomFile(new File(['dummy'], 'input.mov', { type: 'video/quicktime' }));

      expect(
        screen.getByText('MP4 形式の動画ファイルのみアップロードできます')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
    });

    it('Content-Type が video/mp4 以外なら拡張子が .mp4 でも不正として扱う', () => {
      render(<HomeWithAuth />);

      selectCustomFile(new File(['dummy'], 'input.mp4', { type: 'video/quicktime' }));

      expect(
        screen.getByText('MP4 形式の動画ファイルのみアップロードできます')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
    });

    it('サイズが 0 のファイルを選択するとサイズのエラーを表示しボタンを無効化する', () => {
      render(<HomeWithAuth />);

      selectCustomFile(new File([], 'input.mp4', { type: 'video/mp4' }));

      expect(screen.getByText('ファイルサイズが不正です')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
    });

    it('上限を超えるサイズのファイルを選択するとサイズのエラーを表示しボタンを無効化する', () => {
      render(<HomeWithAuth />);

      const file = new File(['dummy'], 'input.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 20 * 1024 * 1024 * 1024 + 1 });
      selectCustomFile(file);

      expect(screen.getByText('ファイルサイズが不正です')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
    });

    it('ドロップした不正なファイルでもエラーを表示しボタンを無効化する', () => {
      render(<HomeWithAuth />);

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
      global.fetch = withUsage(mockFetch);
      render(<HomeWithAuth />);

      selectCustomFile(new File(['dummy'], 'input.mov', { type: 'video/quicktime' }));
      fireEvent.submit(document.querySelector('form') as HTMLFormElement);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(
        screen.getByText('MP4 形式の動画ファイルのみアップロードできます')
      ).toBeInTheDocument();
    });

    it('正しいファイルを選び直すとエラーが消えボタンが有効になる', () => {
      render(<HomeWithAuth />);

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
      global.fetch = withUsage(mockFetch);
      render(<HomeWithAuth />);

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

  describe('離脱時の警告', () => {
    const dispatchBeforeUnload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event;
    };

    it('送信中は beforeunload が抑止され、送信前は抑止されない', async () => {
      global.fetch = withUsage(
        jest.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jobId: 'job-1', uploadUrl: 'https://example.com/upload' }),
        })
      );

      render(<HomeWithAuth />);
      selectFile();
      expect(dispatchBeforeUnload().defaultPrevented).toBe(false);

      fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));
      await waitFor(() => {
        expect(mockXHR.send).toHaveBeenCalled();
      });

      expect(dispatchBeforeUnload().defaultPrevented).toBe(true);
    });

    it('失敗して送信状態が戻ったら beforeunload は抑止されない', async () => {
      global.fetch = withUsage(
        jest.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jobId: 'job-1', uploadUrl: 'https://example.com/upload' }),
        })
      );

      render(<HomeWithAuth />);
      selectFile();
      fireEvent.click(screen.getByRole('button', { name: 'アップロードして処理開始' }));
      await waitFor(() => {
        expect(mockXHR.send).toHaveBeenCalled();
      });

      act(() => {
        mockXHR.status = 500;
        mockXHR.onload?.();
      });
      await waitFor(() => {
        expect(screen.getByText('動画ファイルのアップロードに失敗しました')).toBeInTheDocument();
      });

      expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
    });
  });

  describe('利用回数の制限', () => {
    const jobResponse = {
      ok: true,
      json: async () => ({ jobId: 'job-1', uploadUrl: 'https://example.com/upload' }),
    };
    const submitButton = () => screen.getByRole('button', { name: 'アップロードして処理開始' });

    it('開いたときに残り回数と AI 解析のスイッチ (既定 on) を表示する', async () => {
      render(<HomeWithAuth />);

      expect(
        await screen.findByText('今月の残り: AI 解析あり 1 回 / なし 10 回')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('switch', { name: 'AI 解析 (文字起こし・感情分析) を使う' })
      ).toBeChecked();
    });

    it('スイッチの値を aiAnalysis としてジョブ作成に渡す', async () => {
      const mockFetch = jest.fn().mockResolvedValueOnce(jobResponse);
      global.fetch = withUsage(mockFetch);
      render(<HomeWithAuth />);

      const toggle = await screen.findByRole('switch', { name: /AI 解析/ });
      fireEvent.click(toggle);
      selectFile();
      fireEvent.click(submitButton());

      await waitFor(() => expect(mockFetch).toHaveBeenCalled());
      const body = JSON.parse((mockFetch.mock.calls[0]?.[1] as { body: string }).body);
      expect(body.aiAnalysis).toBe(false);
    });

    it('AI ありの残りが 0 の未ログインは、スイッチを off で選べなくしログインを案内する', async () => {
      global.fetch = withUsage(
        jest.fn(),
        buildUsage({ tier: 'anonymous', remaining: { ai: 0, noAi: 3 } })
      );
      render(<HomeWithAuth />);

      expect(
        await screen.findByText('ログインすると AI 解析を月 1 回お試しできます')
      ).toBeInTheDocument();
      const toggle = screen.getByRole('switch', { name: /AI 解析/ });
      expect(toggle).not.toBeChecked();
      expect(toggle).toBeDisabled();
      const signIn = screen.getByRole('link', { name: 'ログインする' });
      expect(signIn.getAttribute('href')).toBe(
        `https://auth.example.com/signin?callbackUrl=${encodeURIComponent(window.location.href)}`
      );
      expect(screen.queryByRole('link', { name: 'プランを見る' })).not.toBeInTheDocument();
    });

    it('AI ありの残りが 0 のログイン済みは、使い切りとプランの画面を案内する', async () => {
      global.fetch = withUsage(jest.fn(), buildUsage({ remaining: { ai: 0, noAi: 5 } }));
      render(<HomeWithAuth />);

      expect(await screen.findByText('今月の AI 解析の回数を使い切りました')).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: /AI 解析/ })).toBeDisabled();
      expect(screen.getByRole('link', { name: 'プランを見る' }).getAttribute('href')).toBe(
        `https://auth.example.com/plans?callbackUrl=${encodeURIComponent(window.location.href)}`
      );
      expect(screen.queryByRole('link', { name: 'ログインする' })).not.toBeInTheDocument();
    });

    describe('回数が尽きているとき', () => {
      const submit = () => screen.getByRole('button', { name: /アップロードして処理開始/ });

      it('両方 0 のログイン済みは、送信を止めて案内を 1 組だけ出す', async () => {
        const mockFetch = jest.fn();
        global.fetch = withUsage(mockFetch, buildUsage({ remaining: { ai: 0, noAi: 0 } }));
        render(<HomeWithAuth />);

        expect(
          await screen.findByText('今月の利用回数 (AI 解析あり・なし) を使い切りました')
        ).toBeInTheDocument();
        selectFile();
        expect(submit()).toBeDisabled();
        expect(screen.getAllByRole('link', { name: 'プランを見る' })).toHaveLength(1);

        fireEvent.submit(submit().closest('form') as HTMLFormElement);
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('AI なしだけ 0 は、スイッチ off で送信を止め、on に戻すと押せる', async () => {
        global.fetch = withUsage(jest.fn(), buildUsage({ remaining: { ai: 1, noAi: 0 } }));
        render(<HomeWithAuth />);
        const toggle = await screen.findByRole('switch', { name: /AI 解析/ });
        selectFile();
        expect(toggle).toBeChecked();
        expect(submit()).toBeEnabled();
        expect(
          screen.queryByText('今月の AI 解析なしの回数を使い切りました。AI 解析ありなら使えます')
        ).not.toBeInTheDocument();

        fireEvent.click(toggle);
        expect(
          screen.getByText('今月の AI 解析なしの回数を使い切りました。AI 解析ありなら使えます')
        ).toBeInTheDocument();
        expect(submit()).toBeDisabled();
        expect(screen.getAllByRole('link', { name: 'プランを見る' })).toHaveLength(1);

        fireEvent.click(toggle);
        expect(submit()).toBeEnabled();
      });

      it('未ログインの両方 0 は、送信を止めてログインを案内する', async () => {
        global.fetch = withUsage(
          jest.fn(),
          buildUsage({ tier: 'anonymous', remaining: { ai: 0, noAi: 0 } })
        );
        render(<HomeWithAuth />);

        expect(
          await screen.findByText(
            '今月の利用回数を使い切りました。ログインすると回数が増え、AI 解析も月 1 回お試しできます'
          )
        ).toBeInTheDocument();
        selectFile();
        expect(submit()).toBeDisabled();
        expect(screen.getAllByRole('link', { name: 'ログインする' })).toHaveLength(1);
        expect(screen.queryByRole('link', { name: 'プランを見る' })).not.toBeInTheDocument();
      });

      it('AI ありだけ 0 で AI なしが残っていれば、AI なしで送れる', async () => {
        global.fetch = withUsage(jest.fn(), buildUsage({ remaining: { ai: 0, noAi: 5 } }));
        render(<HomeWithAuth />);
        await screen.findByText('今月の AI 解析の回数を使い切りました');
        selectFile();
        expect(submit()).toBeEnabled();
      });

      it('上限なしは止めない', async () => {
        const unlimited = {
          ...buildUsage({ tier: 'pro' }),
          limits: { aiPerMonth: null, noAiPerMonth: null, maxDurationSec: 14400 },
          remaining: { ai: null, noAi: null },
        };
        global.fetch = withUsage(jest.fn(), unlimited);
        render(<HomeWithAuth />);
        await screen.findByText('今月の残り: 無制限');
        selectFile();
        expect(submit()).toBeEnabled();
      });
    });

    it('/api/usage が失敗したら残りとスイッチを出さず、aiAnalysis を送らずにアップロードできる', async () => {
      const mockFetch = jest.fn().mockResolvedValueOnce(jobResponse);
      global.fetch = withUsage(mockFetch, 'error');
      render(<HomeWithAuth />);

      selectFile();
      fireEvent.click(submitButton());

      await waitFor(() => expect(mockFetch).toHaveBeenCalled());
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(screen.queryByText(/今月の残り/)).not.toBeInTheDocument();
      const body = JSON.parse((mockFetch.mock.calls[0]?.[1] as { body: string }).body);
      expect(body).not.toHaveProperty('aiAnalysis');
    });

    it('/api/usage の応答が不正な形でも残りとスイッチを出さない', async () => {
      global.fetch = withUsage(jest.fn(), { tier: 'unknown' });
      render(<HomeWithAuth />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/usage'));
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });

    it('/api/usage の取得が例外でも画面を壊さない', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network')) as jest.Mock;
      render(<HomeWithAuth />);

      await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });

    it('動画の長さが段の上限を超えていたら、警告して送信させずプランの画面を案内する', async () => {
      (getVideoDurationSec as jest.Mock).mockResolvedValue(190 * 60);
      render(<HomeWithAuth />);
      await screen.findByText(/今月の残り/);

      selectFile();

      expect(
        await screen.findByText('この動画は 190 分で、ご利用の上限 (180 分) を超えています')
      ).toBeInTheDocument();
      expect(submitButton()).toBeDisabled();
      expect(screen.getByRole('link', { name: 'プランを見る' })).toBeInTheDocument();
    });

    it('上限以下なら警告しない', async () => {
      (getVideoDurationSec as jest.Mock).mockResolvedValue(180 * 60);
      render(<HomeWithAuth />);
      await screen.findByText(/今月の残り/);

      selectFile();

      await waitFor(() => expect(getVideoDurationSec).toHaveBeenCalled());
      expect(screen.queryByText(/ご利用の上限/)).not.toBeInTheDocument();
      expect(submitButton()).not.toBeDisabled();
    });

    it('長さ超過の警告があるときはフォームを送信しても何もしない', async () => {
      (getVideoDurationSec as jest.Mock).mockResolvedValue(190 * 60);
      const mockFetch = jest.fn();
      global.fetch = withUsage(mockFetch);
      render(<HomeWithAuth />);
      await screen.findByText(/今月の残り/);
      selectFile();
      await screen.findByText(/ご利用の上限/);

      fireEvent.submit(document.querySelector('form') as HTMLFormElement);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('未ログインの長さ超過では、ログインとプランの両方を案内する', async () => {
      (getVideoDurationSec as jest.Mock).mockResolvedValue(61 * 60);
      global.fetch = withUsage(
        jest.fn(),
        buildUsage({ tier: 'anonymous', remaining: { ai: 0, noAi: 3 }, maxDurationSec: 3600 })
      );
      render(<HomeWithAuth />);
      await screen.findByText(/今月の残り/);

      selectFile();
      await screen.findByText(/ご利用の上限/);

      expect(screen.getAllByRole('link', { name: 'ログインする' }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('link', { name: 'プランを見る' }).length).toBeGreaterThan(0);
    });

    it('別のファイルを選び直したら、前のファイルの長さ超過の警告は消える', async () => {
      (getVideoDurationSec as jest.Mock)
        .mockResolvedValueOnce(190 * 60)
        .mockResolvedValueOnce(10 * 60);
      render(<HomeWithAuth />);
      await screen.findByText(/今月の残り/);

      selectFile();
      await screen.findByText(/ご利用の上限/);
      selectFile();

      await waitFor(() => {
        expect(screen.queryByText(/ご利用の上限/)).not.toBeInTheDocument();
      });
    });

    it('選び直す前の動画の長さの結果は捨てる', async () => {
      let resolveFirst: (value: number) => void = () => {};
      (getVideoDurationSec as jest.Mock)
        .mockReturnValueOnce(new Promise<number>((resolve) => (resolveFirst = resolve)))
        .mockResolvedValueOnce(10 * 60);
      render(<HomeWithAuth />);
      await screen.findByText(/今月の残り/);

      selectFile();
      selectFile();
      await act(async () => {
        resolveFirst(190 * 60);
      });

      expect(screen.queryByText(/ご利用の上限/)).not.toBeInTheDocument();
    });

    it.each([
      ['AI_LIMIT_EXCEEDED', 429],
      ['NO_AI_LIMIT_EXCEEDED', 429],
      ['DURATION_LIMIT_EXCEEDED', 400],
    ])('%s が返ったら、返った message とプランの画面を案内する', async (code, status) => {
      const mockFetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status,
        json: async () => ({ error: code, message: `${code} のメッセージ` }),
      });
      global.fetch = withUsage(mockFetch);
      render(<HomeWithAuth />);
      await screen.findByText(/今月の残り/);

      selectFile();
      fireEvent.click(submitButton());

      expect(await screen.findByText(`${code} のメッセージ`)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'プランを見る' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'ログインする' })).not.toBeInTheDocument();
    });

    it('未ログインで上限が返ったら、ログインの案内も出す', async () => {
      global.fetch = withUsage(
        jest.fn().mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: async () => ({ error: 'NO_AI_LIMIT_EXCEEDED', message: '上限です' }),
        }),
        buildUsage({ tier: 'anonymous', remaining: { ai: 0, noAi: 3 } })
      );
      render(<HomeWithAuth />);
      await screen.findByText(/今月の残り/);

      selectFile();
      fireEvent.click(submitButton());

      await screen.findByText('上限です');
      expect(screen.getAllByRole('link', { name: 'ログインする' }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('link', { name: 'プランを見る' }).length).toBeGreaterThan(0);
    });

    it('上限が返ったら残りを取り直す', async () => {
      const usageFetch = jest.fn();
      global.fetch = jest.fn((input: RequestInfo | URL) => {
        if (input === '/api/usage') {
          usageFetch();
          return Promise.resolve({ ok: true, json: async () => buildUsage() });
        }
        return Promise.resolve({
          ok: false,
          status: 429,
          json: async () => ({ error: 'AI_LIMIT_EXCEEDED', message: '上限です' }),
        });
      }) as jest.Mock;
      render(<HomeWithAuth />);
      await screen.findByText(/今月の残り/);

      selectFile();
      fireEvent.click(submitButton());

      await screen.findByText('上限です');
      await waitFor(() => expect(usageFetch).toHaveBeenCalledTimes(2));
    });

    it('上限が返って残りを読み直しても、利用者が off にしたスイッチは off のまま', async () => {
      global.fetch = withUsage(
        jest.fn().mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: async () => ({ error: 'NO_AI_LIMIT_EXCEEDED', message: '上限です' }),
        }),
        buildUsage({ remaining: { ai: 1, noAi: 1 } })
      );
      render(<HomeWithAuth />);
      const toggle = await screen.findByRole('switch', { name: /AI 解析/ });
      fireEvent.click(toggle);
      expect(toggle).not.toBeChecked();

      selectFile();
      fireEvent.click(submitButton());

      await screen.findByText('上限です');
      await waitFor(() => {
        const usageCalls = (global.fetch as jest.Mock).mock.calls.filter(
          ([input]) => input === '/api/usage'
        );
        expect(usageCalls).toHaveLength(2);
      });
      expect(screen.getByRole('switch', { name: /AI 解析/ })).not.toBeChecked();
    });

    it('スイッチ on で上限が返り、読み直した残りで AI ありが 0 なら off で選べなくなる', async () => {
      let usageCalls = 0;
      global.fetch = jest.fn((input: RequestInfo | URL) => {
        if (input === '/api/usage') {
          usageCalls += 1;
          const usage =
            usageCalls === 1 ? buildUsage() : buildUsage({ remaining: { ai: 0, noAi: 10 } });
          return Promise.resolve({ ok: true, status: 200, json: async () => usage });
        }
        return Promise.resolve({
          ok: false,
          status: 429,
          json: async () => ({ error: 'AI_LIMIT_EXCEEDED', message: '上限です' }),
        });
      }) as jest.Mock;
      render(<HomeWithAuth />);
      expect(await screen.findByRole('switch', { name: /AI 解析/ })).toBeChecked();

      selectFile();
      fireEvent.click(submitButton());

      await screen.findByText('上限です');
      await waitFor(() => expect(screen.getByRole('switch', { name: /AI 解析/ })).toBeDisabled());
      expect(screen.getByRole('switch', { name: /AI 解析/ })).not.toBeChecked();
    });

    it('最初の取得に失敗し、上限で読み直して初めて読めたときは既定値を入れる', async () => {
      let usageCalls = 0;
      global.fetch = jest.fn((input: RequestInfo | URL) => {
        if (input === '/api/usage') {
          usageCalls += 1;
          return usageCalls === 1
            ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
            : Promise.resolve({ ok: true, status: 200, json: async () => buildUsage() });
        }
        return Promise.resolve({
          ok: false,
          status: 429,
          json: async () => ({ error: 'IP_LIMIT_EXCEEDED', message: '上限です' }),
        });
      }) as jest.Mock;
      render(<HomeWithAuth />);
      await waitFor(() => expect(usageCalls).toBe(1));
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();

      selectFile();
      fireEvent.click(submitButton());

      await screen.findByText('上限です');
      expect(await screen.findByRole('switch', { name: /AI 解析/ })).toBeChecked();
    });

    it('IP_LIMIT_EXCEEDED は案内なしでメッセージだけを出す', async () => {
      global.fetch = withUsage(
        jest.fn().mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: async () => ({ error: 'IP_LIMIT_EXCEEDED', message: 'お使いの回線の上限です' }),
        }),
        buildUsage({ tier: 'anonymous', remaining: { ai: 0, noAi: 3 } })
      );
      render(<HomeWithAuth />);
      await screen.findByText(/今月の残り/);

      selectFile();
      fireEvent.click(submitButton());

      await screen.findByText('お使いの回線の上限です');
      // AI の案内 (ログイン) は残りの欄に出ているが、上限エラー由来のプランの案内は出ない
      expect(screen.queryByRole('link', { name: 'プランを見る' })).not.toBeInTheDocument();
    });

    it('上限以外の失敗では案内を出さない', async () => {
      global.fetch = withUsage(
        jest.fn().mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({ error: 'INVALID_FILE_TYPE', message: '形式が不正です' }),
        })
      );
      render(<HomeWithAuth />);
      await screen.findByText(/今月の残り/);

      selectFile();
      fireEvent.click(submitButton());

      await screen.findByText('形式が不正です');
      expect(screen.queryByRole('link', { name: 'プランを見る' })).not.toBeInTheDocument();
    });

    it('一番上の段 (pro) では、上限が返ってもプランの画面を案内せずメッセージだけ出す', async () => {
      global.fetch = withUsage(
        jest.fn().mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: async () => ({ error: 'AI_LIMIT_EXCEEDED', message: '上限です' }),
        }),
        buildUsage({ tier: 'pro' })
      );
      render(<HomeWithAuth />);
      await screen.findByText(/今月の残り/);

      selectFile();
      fireEvent.click(submitButton());

      await screen.findByText('上限です');
      expect(screen.queryByRole('link', { name: 'プランを見る' })).not.toBeInTheDocument();
    });

    it('一番上の段 (pro) では、長さ超過でもプランの画面を案内しない', async () => {
      (getVideoDurationSec as jest.Mock).mockResolvedValue(300 * 60);
      global.fetch = withUsage(jest.fn(), buildUsage({ tier: 'pro', maxDurationSec: 14400 }));
      render(<HomeWithAuth />);
      await screen.findByText(/今月の残り/);

      selectFile();

      expect(
        await screen.findByText('この動画は 300 分で、ご利用の上限 (240 分) を超えています')
      ).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'プランを見る' })).not.toBeInTheDocument();
    });

    it('一番上の段 (pro) で AI を使い切ったときは、使い切りの文言だけでプランの画面は案内しない', async () => {
      global.fetch = withUsage(
        jest.fn(),
        buildUsage({ tier: 'pro', remaining: { ai: 0, noAi: 5 } })
      );
      render(<HomeWithAuth />);

      expect(await screen.findByText('今月の AI 解析の回数を使い切りました')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'プランを見る' })).not.toBeInTheDocument();
    });
  });
});
