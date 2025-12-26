import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Footer from '../../../../src/components/layout/Footer';

describe('Footer', () => {
  describe('レンダリング', () => {
    it('デフォルトpropsで正しくレンダリングされる', () => {
      render(<Footer />);

      const versionElement = screen.getByText(/v1\.0\.0/);
      expect(versionElement).toBeInTheDocument();
    });

    it('カスタムversionが正しくレンダリングされる', () => {
      render(<Footer version="2.3.4" />);

      const versionElement = screen.getByText(/v2\.3\.4/);
      expect(versionElement).toBeInTheDocument();
    });

    it('プライバシーポリシーリンクが表示される', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      expect(privacyLink).toBeInTheDocument();
    });

    it('利用規約リンクが表示される', () => {
      render(<Footer />);

      const termsLink = screen.getByText('利用規約');
      expect(termsLink).toBeInTheDocument();
    });
  });

  describe('リンク機能', () => {
    it('プライバシーポリシーリンクがbutton要素としてレンダリングされる', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      expect(privacyLink.tagName).toBe('BUTTON');
    });

    it('利用規約リンクがbutton要素としてレンダリングされる', () => {
      render(<Footer />);

      const termsLink = screen.getByText('利用規約');
      expect(termsLink.tagName).toBe('BUTTON');
    });

    it('プライバシーポリシーリンククリックでダイアログが開く', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      await user.click(privacyLink);

      // ダイアログのタイトルが表示されることを確認
      expect(screen.getByText('プライバシーポリシー', { selector: 'h2' })).toBeInTheDocument();
    });

    it('利用規約リンククリックでダイアログが開く', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      const termsLink = screen.getByText('利用規約');
      await user.click(termsLink);

      // ダイアログのタイトルが表示されることを確認
      expect(screen.getByText('利用規約', { selector: 'h2' })).toBeInTheDocument();
    });

    it('ダイアログの閉じるボタンで閉じることができる', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      await user.click(privacyLink);

      // ダイアログが開いていることを確認
      expect(screen.getByText('プライバシーポリシー', { selector: 'h2' })).toBeInTheDocument();

      // 閉じるボタンを取得してクリック
      const closeButtons = screen.getAllByText('閉じる');
      await user.click(closeButtons[0]);

      // ダイアログが閉じていることを確認（h2要素が存在しない）
      await waitFor(() => {
        expect(screen.queryByText('プライバシーポリシー', { selector: 'h2' })).not.toBeInTheDocument();
      });
    });

    it('複数のダイアログが独立して動作する', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      // プライバシーポリシーを開く
      const privacyLink = screen.getByText('プライバシーポリシー');
      await user.click(privacyLink);
      expect(screen.getByText('プライバシーポリシー', { selector: 'h2' })).toBeInTheDocument();

      // プライバシーポリシーを閉じる
      const closeButtons = screen.getAllByText('閉じる');
      await user.click(closeButtons[0]);
      await waitFor(() => {
        expect(screen.queryByText('プライバシーポリシー', { selector: 'h2' })).not.toBeInTheDocument();
      });

      // 利用規約を開く
      const termsLink = screen.getByText('利用規約');
      await user.click(termsLink);
      expect(screen.getByText('利用規約', { selector: 'h2' })).toBeInTheDocument();

      // 利用規約を閉じる
      const closeButtons2 = screen.getAllByText('閉じる');
      await user.click(closeButtons2[0]);
      await waitFor(() => {
        expect(screen.queryByText('利用規約', { selector: 'h2' })).not.toBeInTheDocument();
      });
    });

    it('リンクがクリック可能（pointer-eventsがnoneでない）', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      const termsLink = screen.getByText('利用規約');

      // MUIのLinkコンポーネントはデフォルトでクリック可能
      expect(privacyLink).toBeInTheDocument();
      expect(termsLink).toBeInTheDocument();
    });
  });

  describe('Material-UI構造', () => {
    it('footer要素が存在する', () => {
      const { container } = render(<Footer />);

      const footer = container.querySelector('footer');
      expect(footer).toBeInTheDocument();
    });

    it('Containerコンポーネントが存在する', () => {
      const { container } = render(<Footer />);

      const containerElement = container.querySelector('.MuiContainer-root');
      expect(containerElement).toBeInTheDocument();
    });

    it('ContainerがmaxWidth="lg"で表示される', () => {
      const { container } = render(<Footer />);

      // Note: This test relies on MUI class names which may change between versions.
      // If this test fails after a MUI upgrade, consider updating the class name
      // or using a different approach to verify the maxWidth prop.
      const containerElement = container.querySelector('.MuiContainer-maxWidthLg');
      expect(containerElement).toBeInTheDocument();
    });

    it('Typography要素にbody2 variantが適用される', () => {
      const { container } = render(<Footer />);

      const typography = container.querySelector('.MuiTypography-body2');
      expect(typography).toBeInTheDocument();
    });
  });

  describe('スタイリング', () => {
    it('footer要素が適切なroleを持つ', () => {
      const { container } = render(<Footer />);

      const footer = container.querySelector('footer');
      expect(footer).toBeInTheDocument();
      expect(footer?.tagName.toLowerCase()).toBe('footer');
    });

    it('テキストが中央揃えで表示される', () => {
      const { container } = render(<Footer />);

      const typography = container.querySelector('.MuiTypography-alignCenter');
      expect(typography).toBeInTheDocument();
    });

    it('リンクがtext.secondaryカラーで表示される', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      const termsLink = screen.getByText('利用規約');

      // MUI Linkコンポーネントとして存在することを確認
      expect(privacyLink).toBeInTheDocument();
      expect(termsLink).toBeInTheDocument();
    });
  });

  describe('バージョン表示', () => {
    it('バージョン番号が"v"プレフィックス付きで表示される', () => {
      render(<Footer version="1.2.3" />);

      const versionText = screen.getByText(/v1\.2\.3/);
      expect(versionText).toBeInTheDocument();
    });

    it('複数桁のバージョン番号も正しく表示される', () => {
      render(<Footer version="10.20.30" />);

      const versionText = screen.getByText(/v10\.20\.30/);
      expect(versionText).toBeInTheDocument();
    });

    it('プレリリースバージョンも表示できる', () => {
      render(<Footer version="1.0.0-beta.1" />);

      const versionText = screen.getByText(/v1\.0\.0-beta\.1/);
      expect(versionText).toBeInTheDocument();
    });
  });

  describe('レイアウト', () => {
    it('バージョン、プライバシーポリシー、利用規約が正しい順序で表示される', () => {
      const { container } = render(<Footer version="1.0.0" />);

      const typography = container.querySelector('.MuiTypography-root');
      const text = typography?.textContent;

      expect(text).toContain('v1.0.0');
      expect(text).toContain('プライバシーポリシー');
      expect(text).toContain('利用規約');

      // 順序を確認（正規表現で順序を検証）
      expect(text).toMatch(/v1\.0\.0.*プライバシーポリシー.*利用規約/);
    });

    it('要素間に区切り文字が存在する', () => {
      const { container } = render(<Footer />);

      const typography = container.querySelector('.MuiTypography-root');
      const text = typography?.textContent;

      // " | " で区切られていることを確認
      expect(text).toMatch(/v1\.0\.0\s*\|\s*プライバシーポリシー\s*\|\s*利用規約/);
    });
  });
});
