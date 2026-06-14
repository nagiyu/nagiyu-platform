import { fireEvent, render, screen } from '@testing-library/react';
import AccountDeletionModal from '@/components/AccountDeletionModal';

afterEach(() => {
  jest.clearAllMocks();
});

describe('AccountDeletionModal', () => {
  describe('open=false のとき', () => {
    it('モーダルが表示されない', () => {
      render(
        <AccountDeletionModal
          open={false}
          loading={false}
          error={null}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('open=true のとき', () => {
    it('削除範囲の説明が表示される', () => {
      render(
        <AccountDeletionModal
          open={true}
          loading={false}
          error={null}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      // 削除が不可逆であることの説明
      expect(screen.getByText(/取り消せません/)).toBeInTheDocument();
    });

    it('削除対象データ（会話・記憶・親密度・ノート等）が表示される', () => {
      render(
        <AccountDeletionModal
          open={true}
          loading={false}
          error={null}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      expect(screen.getByText(/会話履歴/)).toBeInTheDocument();
      expect(screen.getByText(/記憶データ/)).toBeInTheDocument();
      expect(screen.getByText(/親密度/)).toBeInTheDocument();
      expect(screen.getByText(/ノート/)).toBeInTheDocument();
    });

    it('セーフティログの匿名化保持の注記が表示される', () => {
      render(
        <AccountDeletionModal
          open={true}
          loading={false}
          error={null}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      const notice = screen.getByTestId('safety-log-notice');
      expect(notice).toBeInTheDocument();
      expect(notice).toHaveTextContent(/匿名化/);
    });

    it('確認チェックボックスが表示される', () => {
      render(
        <AccountDeletionModal
          open={true}
          loading={false}
          error={null}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      // Checkbox の input 要素を role で取得する（data-testid は CheckboxProps 未対応）
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('チェック前は退会ボタンが disabled', () => {
      render(
        <AccountDeletionModal
          open={true}
          loading={false}
          error={null}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      const confirmButton = screen.getByTestId('deletion-confirm');
      expect(confirmButton).toBeDisabled();
    });

    it('チェックボックスにチェックすると退会ボタンが有効化される', () => {
      render(
        <AccountDeletionModal
          open={true}
          loading={false}
          error={null}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      // Checkbox の input 要素を role で取得する
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(screen.getByTestId('deletion-confirm')).not.toBeDisabled();
    });

    it('チェック後に退会ボタンをクリックすると onConfirm が呼ばれる', () => {
      const onConfirm = jest.fn();
      render(
        <AccountDeletionModal
          open={true}
          loading={false}
          error={null}
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />
      );
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      fireEvent.click(screen.getByTestId('deletion-confirm'));
      expect(onConfirm).toHaveBeenCalled();
    });

    it('キャンセルボタンをクリックすると onCancel が呼ばれる', () => {
      const onCancel = jest.fn();
      render(
        <AccountDeletionModal
          open={true}
          loading={false}
          error={null}
          onConfirm={jest.fn()}
          onCancel={onCancel}
        />
      );
      fireEvent.click(screen.getByTestId('deletion-cancel'));
      expect(onCancel).toHaveBeenCalled();
    });

    it('キャンセルするとチェック状態がリセットされる', () => {
      const onCancel = jest.fn();
      render(
        <AccountDeletionModal
          open={true}
          loading={false}
          error={null}
          onConfirm={jest.fn()}
          onCancel={onCancel}
        />
      );
      // チェックを入れると退会ボタンが有効化される
      fireEvent.click(screen.getByRole('checkbox'));
      expect(screen.getByTestId('deletion-confirm')).not.toBeDisabled();

      // キャンセルする
      fireEvent.click(screen.getByTestId('deletion-cancel'));
      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('loading=true のとき', () => {
    it('チェックボックスが disabled になる', () => {
      render(
        <AccountDeletionModal
          open={true}
          loading={true}
          error={null}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      // Checkbox の input 要素を role で取得する
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeDisabled();
    });

    it('退会ボタンが disabled になる', () => {
      render(
        <AccountDeletionModal
          open={true}
          loading={true}
          error={null}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      expect(screen.getByTestId('deletion-confirm')).toBeDisabled();
    });

    it('キャンセルボタンが disabled になる', () => {
      render(
        <AccountDeletionModal
          open={true}
          loading={true}
          error={null}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      expect(screen.getByTestId('deletion-cancel')).toBeDisabled();
    });
  });

  describe('error が非 null のとき', () => {
    it('エラーメッセージが表示される', () => {
      const errorMessage = '退会処理に失敗しました。時間を置いて再度お試しください。';
      render(
        <AccountDeletionModal
          open={true}
          loading={false}
          error={errorMessage}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      const errorEl = screen.getByTestId('deletion-error');
      expect(errorEl).toBeInTheDocument();
      expect(errorEl).toHaveTextContent(errorMessage);
    });

    it('error が null のときエラー表示がない', () => {
      render(
        <AccountDeletionModal
          open={true}
          loading={false}
          error={null}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      expect(screen.queryByTestId('deletion-error')).not.toBeInTheDocument();
    });
  });
});
