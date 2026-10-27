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

  describe('拡張props', () => {
    it('childrenがdescriptionと並んで表示される', () => {
      render(
        <ConfirmDialog {...defaultProps}>
          <div>削除対象の詳細</div>
        </ConfirmDialog>
      );

      expect(screen.getByText('この操作は取り消せません。')).toBeInTheDocument();
      expect(screen.getByText('削除対象の詳細')).toBeInTheDocument();
    });

    it('descriptionを省略してもchildrenが表示される', () => {
      render(
        <ConfirmDialog open title="確認" onConfirm={jest.fn()} onCancel={jest.fn()}>
          <div>本文のみ</div>
        </ConfirmDialog>
      );

      expect(screen.getByText('本文のみ')).toBeInTheDocument();
    });

    it('ダイアログがタイトルで名前付けされる', () => {
      render(<ConfirmDialog {...defaultProps} />);

      expect(screen.getByRole('dialog', { name: '削除の確認' })).toBeInTheDocument();
    });

    it('confirmDisabledで確定ボタンだけが無効になる', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog {...defaultProps} confirmDisabled />);

      const confirm = screen.getByRole('button', { name: '削除' });
      expect(confirm).toBeDisabled();
      expect(screen.getByRole('button', { name: 'キャンセル' })).not.toBeDisabled();
      await user.click(confirm);
      expect(defaultProps.onConfirm).not.toHaveBeenCalled();
    });

    it('confirmColorがボタンに反映される', () => {
      const { rerender } = render(<ConfirmDialog {...defaultProps} />);
      expect(screen.getByRole('button', { name: '削除' }).className).toMatch(/color-danger/);

      rerender(<ConfirmDialog {...defaultProps} confirmColor="primary" />);
      expect(screen.getByRole('button', { name: '削除' }).className).toMatch(/color-primary/);
    });

    it('confirmTestIdが確定ボタンのdata-testidになる', () => {
      render(<ConfirmDialog {...defaultProps} confirmTestId="confirm-btn" />);

      expect(screen.getByTestId('confirm-btn')).toHaveTextContent('削除');
    });
  });

  describe('処理中の閉じる操作', () => {
    it('loading中はEscapeでonCancelが呼ばれない', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog {...defaultProps} loading />);

      await user.keyboard('{Escape}');

      expect(defaultProps.onCancel).not.toHaveBeenCalled();
    });

    it('loading中は背景クリックでonCancelが呼ばれない', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog {...defaultProps} loading />);

      await user.click(document.querySelector('.MuiBackdrop-root') as HTMLElement);

      expect(defaultProps.onCancel).not.toHaveBeenCalled();
    });

    it('loadingでない時はEscapeでonCancelが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog {...defaultProps} />);

      await user.keyboard('{Escape}');

      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('アクセシビリティ', () => {
    it('ダイアログにrole="dialog"が設定されている', () => {
      render(<ConfirmDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
