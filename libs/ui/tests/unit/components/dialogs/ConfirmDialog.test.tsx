import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from '../../../../src/components/dialogs/ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    title: '削除の確認',
    description: 'この操作は取り消せません。',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    defaultProps.onConfirm.mockClear();
    defaultProps.onCancel.mockClear();
  });

  describe('レンダリング', () => {
    it('openがtrueの時にダイアログが表示される', () => {
      render(<ConfirmDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('openがfalseの時にダイアログが表示されない', () => {
      render(<ConfirmDialog {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('タイトルが表示される', () => {
      render(<ConfirmDialog {...defaultProps} />);

      expect(screen.getByText('削除の確認')).toBeInTheDocument();
    });

    it('説明文が表示される', () => {
      render(<ConfirmDialog {...defaultProps} />);

      expect(screen.getByText('この操作は取り消せません。')).toBeInTheDocument();
    });

    it('デフォルトのconfirmLabelが「削除」になる', () => {
      render(<ConfirmDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    });

    it('デフォルトのcancelLabelが「キャンセル」になる', () => {
      render(<ConfirmDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
    });

    it('カスタムconfirmLabelが適用される', () => {
      render(<ConfirmDialog {...defaultProps} confirmLabel="ログアウト" />);

      expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument();
    });

    it('カスタムcancelLabelが適用される', () => {
      render(<ConfirmDialog {...defaultProps} cancelLabel="戻る" />);

      expect(screen.getByRole('button', { name: '戻る' })).toBeInTheDocument();
    });
  });

  describe('操作', () => {
    it('確認ボタンをクリックするとonConfirmが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '削除' }));

      expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
    });

    it('キャンセルボタンをクリックするとonCancelが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    });

    it('ダイアログの外側をクリックするとonCancelが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog {...defaultProps} />);

      const backdrop = document.querySelector('.MuiBackdrop-root');
      if (backdrop) {
        await user.click(backdrop as HTMLElement);
        expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('ローディング状態', () => {
    it('loading=trueの時にキャンセルボタンが無効になる', () => {
      render(<ConfirmDialog {...defaultProps} loading={true} />);

      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    });

    it('loading=falseの時にキャンセルボタンが有効になる', () => {
      render(<ConfirmDialog {...defaultProps} loading={false} />);

      expect(screen.getByRole('button', { name: 'キャンセル' })).not.toBeDisabled();
    });
  });

  describe('アクセシビリティ', () => {
    it('ダイアログにrole="dialog"が設定されている', () => {
      render(<ConfirmDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
