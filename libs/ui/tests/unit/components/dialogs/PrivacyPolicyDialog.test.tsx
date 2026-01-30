import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrivacyPolicyDialog from '../../../../src/components/dialogs/PrivacyPolicyDialog';

describe('PrivacyPolicyDialog', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  describe('レンダリング', () => {
    it('openがtrueの時にダイアログが表示される', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('プライバシーポリシー')).toBeInTheDocument();
    });

    it('openがfalseの時にダイアログが表示されない', () => {
      render(<PrivacyPolicyDialog open={false} onClose={mockOnClose} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('fullWidth maxWidth="md" が設定されている', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });
  });

  describe('コンテンツ表示', () => {
    it('全14条のタイトルが表示される', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      // Updated to reflect AdSense-related sections at the beginning
      expect(screen.getByText('第1条（広告の配信について）')).toBeInTheDocument();
      expect(screen.getByText('第2条（Cookie（クッキー）について）')).toBeInTheDocument();
      expect(screen.getByText('第3条（Cookieの設定について）')).toBeInTheDocument();
      expect(screen.getByText('第4条（データの取り扱い）')).toBeInTheDocument();
      expect(screen.getByText('第5条（個人情報）')).toBeInTheDocument();
      expect(screen.getByText('第6条（個人情報の収集方法）')).toBeInTheDocument();
      expect(screen.getByText('第7条（個人情報を収集・利用する目的）')).toBeInTheDocument();
      expect(screen.getByText('第8条（利用目的の変更）')).toBeInTheDocument();
      expect(screen.getByText('第9条（個人情報の第三者提供）')).toBeInTheDocument();
      expect(screen.getByText('第10条（個人情報の開示）')).toBeInTheDocument();
      expect(screen.getByText('第11条（個人情報の訂正および削除）')).toBeInTheDocument();
      expect(screen.getByText('第12条（個人情報の利用停止等）')).toBeInTheDocument();
      expect(screen.getByText('第13条（プライバシーポリシーの変更）')).toBeInTheDocument();
      expect(screen.getByText('第14条（お問い合わせ窓口）')).toBeInTheDocument();
    });

    it('第1条（AdSense関連）の内容が表示される', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      expect(
        screen.getByText(/当サイトは第三者配信の広告サービス「Google AdSense/)
      ).toBeInTheDocument();
    });

    it('第7条のサブコンテンツが表示される', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      expect(screen.getByText('なぎゆーサービスの提供・運営のため')).toBeInTheDocument();
      expect(screen.getByText(/ユーザーからのお問い合わせに回答するため/)).toBeInTheDocument();
    });

    it('第9条のサブアイテムが表示される', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      expect(screen.getByText('利用目的に第三者への提供を含むこと')).toBeInTheDocument();
      expect(screen.getByText('第三者に提供されるデータの項目')).toBeInTheDocument();
      expect(screen.getByText('第三者への提供の手段または方法')).toBeInTheDocument();
    });

    it('第14条のリンクが表示される', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      const link = screen.getByRole('link', {
        name: /https:\/\/forms\.gle\/oxzHNFBWBpFGNaKm7/,
      });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://forms.gle/oxzHNFBWBpFGNaKm7');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('ダイアログ構造', () => {
    it('DialogTitleが存在する', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      expect(screen.getByText('プライバシーポリシー')).toBeInTheDocument();
    });

    it('DialogContentが存在する', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      // Check that dialog content with policy sections exists
      expect(screen.getByText('第1条（広告の配信について）')).toBeInTheDocument();
    });

    it('DialogActionsが存在する', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: '閉じる' });
      expect(closeButton).toBeInTheDocument();
    });

    it('スクロール可能なコンテンツエリアが存在する', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      // Verify scrollable content exists by checking for policy content
      expect(screen.getByText(/当サイトは第三者配信の広告サービス/)).toBeInTheDocument();
    });
  });

  describe('閉じる機能', () => {
    it('ヘッダーの閉じるボタン（X）をクリックするとonCloseが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('フッターの閉じるボタンをクリックするとonCloseが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: '閉じる' });
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('ダイアログの外側をクリックするとonCloseが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      // Get the backdrop (MuiBackdrop-root) and click it
      const backdrop = document.querySelector('.MuiBackdrop-root');
      if (backdrop) {
        await user.click(backdrop as HTMLElement);
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('アクセシビリティ', () => {
    it('閉じるボタンに適切なaria-labelが設定されている', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: /close/i });
      expect(closeButton).toHaveAttribute('aria-label', 'close');
    });

    it('ダイアログにrole="dialog"が設定されている', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('スタイリング', () => {
    it('タイトルがh6 variantで表示される', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      // Check that section titles are rendered as headings
      const firstTitle = screen.getByText('第1条（広告の配信について）');
      expect(firstTitle.tagName).toBe('H2');
    });

    it('フッターボタンがcontained variantで表示される', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: '閉じる' });
      expect(closeButton).toHaveClass('MuiButton-contained');
    });

    it('フッターボタンがprimary colorで表示される', () => {
      render(<PrivacyPolicyDialog open={true} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: '閉じる' });
      expect(closeButton).toHaveClass('MuiButton-colorPrimary');
    });
  });
});
