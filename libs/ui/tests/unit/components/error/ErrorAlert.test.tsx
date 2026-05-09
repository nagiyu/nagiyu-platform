import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import ErrorAlert from '../../../../src/components/error/ErrorAlert';

describe('ErrorAlert', () => {
  describe('表示判定', () => {
    it('message も error も未指定なら表示しない', () => {
      const { container } = render(<ErrorAlert />);
      expect(container.firstChild).toBeNull();
    });

    it('message が空文字なら表示しない', () => {
      const { container } = render(<ErrorAlert message="" />);
      expect(container.firstChild).toBeNull();
    });

    it('error が null なら表示しない', () => {
      const { container } = render(<ErrorAlert error={null} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('既存 message API', () => {
    it('message と title を表示する', () => {
      render(<ErrorAlert message="エラーメッセージ" title="エラー" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('エラー')).toBeInTheDocument();
      expect(screen.getByText('エラーメッセージ')).toBeInTheDocument();
    });

    it('severity を warning に変更できる', () => {
      render(<ErrorAlert message="警告" severity="warning" />);
      expect(screen.getByRole('alert')).toHaveClass(/MuiAlert-colorWarning/);
    });
  });

  describe('error props', () => {
    it('error が string の場合はそのまま表示する', () => {
      render(<ErrorAlert error="文字列エラー" />);
      expect(screen.getByText('文字列エラー')).toBeInTheDocument();
    });

    it('error が Error インスタンスの場合は message を表示する', () => {
      render(<ErrorAlert error={new Error('Error 由来のメッセージ')} />);
      expect(screen.getByText('Error 由来のメッセージ')).toBeInTheDocument();
    });

    it('APIError 互換オブジェクトの errorInfo.message を優先表示する', () => {
      const apiError = Object.assign(new Error('生メッセージ'), {
        errorInfo: { message: '整形済みメッセージ', shouldRetry: true },
      });
      render(<ErrorAlert error={apiError} />);
      expect(screen.getByText('整形済みメッセージ')).toBeInTheDocument();
      expect(screen.queryByText('生メッセージ')).not.toBeInTheDocument();
    });

    it('message が指定されていれば error より優先する', () => {
      render(<ErrorAlert message="優先メッセージ" error="error 側" />);
      expect(screen.getByText('優先メッセージ')).toBeInTheDocument();
      expect(screen.queryByText('error 側')).not.toBeInTheDocument();
    });
  });

  describe('details', () => {
    it('details prop を ul/li で表示する', () => {
      render(<ErrorAlert message="親メッセージ" details={['詳細1', '詳細2']} />);
      expect(screen.getByText('詳細1')).toBeInTheDocument();
      expect(screen.getByText('詳細2')).toBeInTheDocument();
    });

    it('APIError 互換の errorInfo.details を自動表示する', () => {
      const apiError = Object.assign(new Error('e'), {
        errorInfo: { message: 'メイン', details: ['errorInfo 詳細1'] },
      });
      render(<ErrorAlert error={apiError} />);
      expect(screen.getByText('errorInfo 詳細1')).toBeInTheDocument();
    });
  });

  describe('onRetry', () => {
    it('onRetry を渡すとリトライボタンが表示される', () => {
      render(<ErrorAlert message="エラー" onRetry={() => {}} />);
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });

    it('retryLabel でラベルを変更できる', () => {
      render(<ErrorAlert message="エラー" onRetry={() => {}} retryLabel="やり直す" />);
      expect(screen.getByRole('button', { name: 'やり直す' })).toBeInTheDocument();
    });

    it('リトライボタンクリックで onRetry が呼ばれる', () => {
      const handleRetry = jest.fn();
      render(<ErrorAlert message="エラー" onRetry={handleRetry} />);
      fireEvent.click(screen.getByRole('button', { name: '再試行' }));
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    it('errorInfo.shouldRetry が false ならリトライボタンを表示しない', () => {
      const apiError = Object.assign(new Error('e'), {
        errorInfo: { message: 'm', shouldRetry: false },
      });
      render(<ErrorAlert error={apiError} onRetry={() => {}} />);
      expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
    });
  });

  describe('onClose', () => {
    it('onClose を渡すと閉じるボタンが表示され、クリックで呼ばれる', () => {
      const handleClose = jest.fn();
      render(<ErrorAlert message="エラー" onClose={handleClose} />);
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('アクセシビリティ', () => {
    it('違反がない（jest-axe、message のみ）', async () => {
      const { container } = render(
        <ErrorAlert message="エラーが発生しました" title="エラー" />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('違反がない（jest-axe、リトライ + details）', async () => {
      const { container } = render(
        <ErrorAlert
          message="エラーが発生しました"
          details={['詳細1', '詳細2']}
          onRetry={() => {}}
        />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
