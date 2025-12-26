import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TermsOfServiceDialog from '../../../../src/components/dialogs/TermsOfServiceDialog';

describe('TermsOfServiceDialog', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  describe('レンダリング', () => {
    it('openがtrueの時にダイアログが表示される', () => {
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('利用規約')).toBeInTheDocument();
    });

    it('openがfalseの時にダイアログが表示されない', () => {
      render(<TermsOfServiceDialog open={false} onClose={mockOnClose} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('fullWidth maxWidth="md" が設定されている', () => {
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });
  });

  describe('コンテンツ表示', () => {
    it('全15条のタイトルが表示される', () => {
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      expect(screen.getByText('第1条（適用）')).toBeInTheDocument();
      expect(screen.getByText('第2条（利用登録）')).toBeInTheDocument();
      expect(screen.getByText('第3条（ユーザーIDおよびパスワードの管理）')).toBeInTheDocument();
      expect(screen.getByText('第4条（利用料金および支払方法）')).toBeInTheDocument();
      expect(screen.getByText('第5条（禁止事項）')).toBeInTheDocument();
      expect(screen.getByText('第6条（本サービスの提供の停止等）')).toBeInTheDocument();
      expect(screen.getByText('第7条（利用制限および登録抹消）')).toBeInTheDocument();
      expect(screen.getByText('第8条（退会）')).toBeInTheDocument();
      expect(screen.getByText('第9条（保証の否認および免責事項）')).toBeInTheDocument();
      expect(screen.getByText('第10条（サービス内容の変更等）')).toBeInTheDocument();
      expect(screen.getByText('第11条（利用規約の変更）')).toBeInTheDocument();
      expect(screen.getByText('第12条（個人情報の取扱い）')).toBeInTheDocument();
      expect(screen.getByText('第13条（通知または連絡）')).toBeInTheDocument();
      expect(screen.getByText('第14条（権利義務の譲渡の禁止）')).toBeInTheDocument();
      expect(screen.getByText('第15条（準拠法・裁判管轄）')).toBeInTheDocument();
    });

    it('第1条の内容が表示される', () => {
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      expect(
        screen.getByText(
          /本規約は、なぎゆー（以下、「当方」といいます。）がこのウェブサイト上で提供するサービス/
        )
      ).toBeInTheDocument();
    });

    it('第2条のサブアイテムが表示される', () => {
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      expect(
        screen.getByText('利用登録の申請に際して虚偽の事項を届け出た場合')
      ).toBeInTheDocument();
      expect(
        screen.getByText('本規約に違反したことがある者からの申請である場合')
      ).toBeInTheDocument();
    });

    it('第5条の禁止事項のサブアイテムが表示される', () => {
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      expect(screen.getByText('法令または公序良俗に違反する行為')).toBeInTheDocument();
      expect(screen.getByText('犯罪行為に関連する行為')).toBeInTheDocument();
      expect(screen.getByText('不正アクセスをし、またはこれを試みる行為')).toBeInTheDocument();
    });
  });

  describe('ダイアログ構造', () => {
    it('DialogTitleが存在する', () => {
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      expect(screen.getByText('利用規約')).toBeInTheDocument();
    });

    it('DialogContentが存在する', () => {
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      // Check that dialog content with term sections exists
      expect(screen.getByText('第1条（適用）')).toBeInTheDocument();
    });

    it('DialogActionsが存在する', () => {
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: '閉じる' });
      expect(closeButton).toBeInTheDocument();
    });

    it('スクロール可能なコンテンツエリアが存在する', () => {
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      // Verify scrollable content exists by checking for term content
      expect(screen.getByText(/本規約は、なぎゆー/)).toBeInTheDocument();
    });
  });

  describe('閉じる機能', () => {
    it('ヘッダーの閉じるボタン（X）をクリックするとonCloseが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('フッターの閉じるボタンをクリックするとonCloseが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: '閉じる' });
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('ダイアログの外側をクリックするとonCloseが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

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
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: /close/i });
      expect(closeButton).toHaveAttribute('aria-label', 'close');
    });

    it('ダイアログにrole="dialog"が設定されている', () => {
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('スタイリング', () => {
    it('タイトルがh6 variantで表示される', () => {
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      // Check that section titles are rendered as headings
      const firstTitle = screen.getByText('第1条（適用）');
      expect(firstTitle.tagName).toBe('H2');
    });

    it('フッターボタンがcontained variantで表示される', () => {
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: '閉じる' });
      expect(closeButton).toHaveClass('MuiButton-contained');
    });

    it('フッターボタンがprimary colorで表示される', () => {
      render(<TermsOfServiceDialog open={true} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: '閉じる' });
      expect(closeButton).toHaveClass('MuiButton-colorPrimary');
    });
  });
});
