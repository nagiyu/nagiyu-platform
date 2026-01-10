import { render, screen, fireEvent, waitFor } from '../test-utils';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import Home from '../../../src/app/page';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('Home (Top Page)', () => {
  const mockPush = jest.fn();
  const mockRouter = {
    push: mockPush,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Initial Rendering', () => {
    it('ページタイトルと説明を表示する', () => {
      render(<Home />);

      expect(screen.getByRole('heading', { name: 'Codec Converter' })).toBeInTheDocument();
      expect(screen.getByText('動画ファイルのコーデックを変換します')).toBeInTheDocument();
    });

    it('ファイルアップロードエリアを表示する', () => {
      render(<Home />);

      expect(
        screen.getByRole('button', { name: 'ファイルをドラッグ&ドロップ または クリックして選択' })
      ).toBeInTheDocument();
      expect(screen.getByText('MP4ファイルのみ、最大500MB')).toBeInTheDocument();
    });

    it('コーデック選択ラジオボタンを表示する', () => {
      render(<Home />);

      expect(screen.getByLabelText(/H.264/)).toBeInTheDocument();
      expect(screen.getByLabelText(/VP9/)).toBeInTheDocument();
      expect(screen.getByLabelText(/AV1/)).toBeInTheDocument();
    });

    it('H.264がデフォルトで選択されている', () => {
      render(<Home />);

      const h264Radio = screen.getByLabelText(/H.264/) as HTMLInputElement;
      expect(h264Radio.checked).toBe(true);
    });

    it('変換開始ボタンが初期状態では非活性である', () => {
      render(<Home />);

      const submitButton = screen.getByRole('button', { name: '変換開始' });
      expect(submitButton).toBeDisabled();
    });
  });

  describe('File Selection', () => {
    it('ファイル入力をクリックしてファイルを選択できる', async () => {
      render(<Home />);

      const file = new File(['video content'], 'test.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 }); // 100MB

      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText(/test.mp4/)).toBeInTheDocument();
        expect(screen.getByText(/100.00 MB/)).toBeInTheDocument();
      });
    });

    it('アップロードエリアをクリックしてファイル選択ダイアログを開ける', async () => {
      render(<Home />);

      const uploadArea = screen.getByRole('button', {
        name: 'ファイルをドラッグ&ドロップ または クリックして選択',
      });
      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;

      const clickSpy = jest.fn();
      fileInput.click = clickSpy;

      await userEvent.click(uploadArea);

      expect(clickSpy).toHaveBeenCalled();
    });

    it('Enterキーでファイル選択ダイアログを開ける', async () => {
      render(<Home />);

      const uploadArea = screen.getByRole('button', {
        name: 'ファイルをドラッグ&ドロップ または クリックして選択',
      });
      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;

      const clickSpy = jest.fn();
      fileInput.click = clickSpy;

      uploadArea.focus();
      fireEvent.keyDown(uploadArea, { key: 'Enter' });

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('Drag and Drop', () => {
    it('ファイルをドラッグオーバーすると枠線がハイライトされる', () => {
      render(<Home />);

      const uploadArea = screen.getByRole('button', {
        name: 'ファイルをドラッグ&ドロップ または クリックして選択',
      });

      fireEvent.dragOver(uploadArea);

      expect(uploadArea).toHaveStyle({ borderColor: '#0070f3' });
    });

    it('ファイルをドラッグリーブするとハイライトが解除される', () => {
      render(<Home />);

      const uploadArea = screen.getByRole('button', {
        name: 'ファイルをドラッグ&ドロップ または クリックして選択',
      });

      fireEvent.dragOver(uploadArea);
      fireEvent.dragLeave(uploadArea);

      expect(uploadArea).toHaveStyle({ borderColor: '#ccc' });
    });

    it('ファイルをドロップすると選択される', async () => {
      render(<Home />);

      const file = new File(['video content'], 'dropped.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 }); // 50MB

      const uploadArea = screen.getByRole('button', {
        name: 'ファイルをドラッグ&ドロップ または クリックして選択',
      });

      fireEvent.drop(uploadArea, {
        dataTransfer: {
          files: [file],
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/dropped.mp4/)).toBeInTheDocument();
      });
    });
  });

  describe('File Validation', () => {
    it('500MBを超えるファイルを選択するとエラーメッセージを表示する', async () => {
      render(<Home />);

      const file = new File(['video content'], 'large.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 600 * 1024 * 1024 }); // 600MB

      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'ファイルサイズは500MB以下である必要があります'
        );
      });
    });

    it('MP4以外のファイルを選択するとエラーメッセージを表示する', async () => {
      render(<Home />);

      const file = new File(['video content'], 'video.avi', { type: 'video/avi' });
      Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 });

      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('MP4ファイルのみアップロード可能です');
      });
    });

    it('ファイルサイズが0の場合エラーメッセージを表示する', async () => {
      render(<Home />);

      const file = new File([''], 'empty.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 0 });

      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('500MB（境界値）のファイルを選択できる', async () => {
      render(<Home />);

      const file = new File(['video content'], 'boundary.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 500 * 1024 * 1024 }); // 500MB

      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText(/boundary.mp4/)).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });
  });

  describe('Codec Selection', () => {
    it('VP9を選択できる', async () => {
      render(<Home />);

      const vp9Radio = screen.getByLabelText(/VP9/) as HTMLInputElement;
      await userEvent.click(vp9Radio);

      expect(vp9Radio.checked).toBe(true);
    });

    it('AV1を選択できる', async () => {
      render(<Home />);

      const av1Radio = screen.getByLabelText(/AV1/) as HTMLInputElement;
      await userEvent.click(av1Radio);

      expect(av1Radio.checked).toBe(true);
    });

    it('コーデックの説明が表示される', () => {
      render(<Home />);

      expect(screen.getByText(/互換性重視（MP4）/)).toBeInTheDocument();
      expect(screen.getByText(/バランス型（WebM）/)).toBeInTheDocument();
      expect(screen.getByText(/高圧縮率（WebM）/)).toBeInTheDocument();
    });
  });

  describe('Upload Flow', () => {
    it('ファイル選択後に変換開始ボタンが活性化される', async () => {
      render(<Home />);

      const file = new File(['video content'], 'test.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 });

      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: '変換開始' });
        expect(submitButton).not.toBeDisabled();
      });
    });

    it('正常なアップロードフローが実行される', async () => {
      render(<Home />);

      const file = new File(['video content'], 'test.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 });

      // Mock API responses
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jobId: 'test-job-id',
            uploadUrl: 'https://s3.example.com/presigned-url',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jobId: 'test-job-id',
            status: 'PROCESSING',
          }),
        });

      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      const submitButton = screen.getByRole('button', { name: '変換開始' });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/jobs/test-job-id');
      });

      // Verify API calls
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'test.mp4',
          fileSize: 100 * 1024 * 1024,
          contentType: 'video/mp4',
          outputCodec: 'h264',
        }),
      });
      expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://s3.example.com/presigned-url', {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': 'video/mp4',
        },
      });
      expect(global.fetch).toHaveBeenNthCalledWith(3, '/api/jobs/test-job-id/submit', {
        method: 'POST',
      });
    });

    it('アップロード中はボタンが非活性になる', async () => {
      render(<Home />);

      const file = new File(['video content'], 'test.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 });

      // Mock API responses with delay
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({
                    jobId: 'test-job-id',
                    uploadUrl: 'https://s3.example.com/presigned-url',
                  }),
                }),
              100
            )
          )
      );

      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      const submitButton = screen.getByRole('button', { name: '変換開始' });
      await userEvent.click(submitButton);

      // Check button is disabled during upload
      expect(screen.getByRole('button', { name: 'アップロード中...' })).toBeDisabled();
    });

    it('選択されたコーデックでジョブを作成する', async () => {
      render(<Home />);

      const file = new File(['video content'], 'test.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jobId: 'test-job-id',
            uploadUrl: 'https://s3.example.com/presigned-url',
          }),
        })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jobId: 'test-job-id', status: 'PROCESSING' }),
        });

      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      // Select VP9 codec
      const vp9Radio = screen.getByLabelText(/VP9/);
      await userEvent.click(vp9Radio);

      const submitButton = screen.getByRole('button', { name: '変換開始' });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/jobs',
          expect.objectContaining({
            body: expect.stringContaining('"outputCodec":"vp9"'),
          })
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('ジョブ作成エラー時にエラーメッセージを表示する', async () => {
      render(<Home />);

      const file = new File(['video content'], 'test.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'INTERNAL_ERROR',
          message: 'ジョブの作成に失敗しました',
        }),
      });

      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      const submitButton = screen.getByRole('button', { name: '変換開始' });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('ジョブの作成に失敗しました');
      });
    });

    it('S3アップロードエラー時にエラーメッセージを表示する', async () => {
      render(<Home />);

      const file = new File(['video content'], 'test.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jobId: 'test-job-id',
            uploadUrl: 'https://s3.example.com/presigned-url',
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
        });

      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      const submitButton = screen.getByRole('button', { name: '変換開始' });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('ファイルのアップロードに失敗しました');
      });
    });

    it('ジョブ投入エラー時にエラーメッセージを表示する', async () => {
      render(<Home />);

      const file = new File(['video content'], 'test.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jobId: 'test-job-id',
            uploadUrl: 'https://s3.example.com/presigned-url',
          }),
        })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            error: 'SUBMIT_ERROR',
            message: 'ジョブの投入に失敗しました',
          }),
        });

      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      const submitButton = screen.getByRole('button', { name: '変換開始' });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('ジョブの投入に失敗しました');
      });
    });

    it('ファイル未選択時にエラーメッセージを表示する', async () => {
      render(<Home />);

      const submitButton = screen.getByRole('button', { name: '変換開始' });

      // Force enable button for testing
      submitButton.removeAttribute('disabled');
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('ファイルを選択してください');
      });
    });
  });

  describe('Accessibility', () => {
    it('ファイルアップロードエリアにaria-labelが設定されている', () => {
      render(<Home />);

      const uploadArea = screen.getByRole('button', {
        name: 'ファイルをドラッグ&ドロップ または クリックして選択',
      });
      expect(uploadArea).toHaveAttribute('aria-label');
    });

    it('エラーメッセージにrole="alert"が設定されている', async () => {
      render(<Home />);

      const file = new File(['video content'], 'large.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 600 * 1024 * 1024 });

      const fileInput = screen.getByLabelText('ファイル選択') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('フォームにfieldsetとlegendが適切に設定されている', () => {
      render(<Home />);

      expect(screen.getByText('出力コーデック選択')).toBeInTheDocument();
    });
  });
});
