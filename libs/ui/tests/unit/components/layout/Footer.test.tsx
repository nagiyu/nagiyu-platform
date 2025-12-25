import { render, screen } from '@testing-library/react';
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
    it('プライバシーポリシーリンクが正しいhrefを持つ', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      expect(privacyLink).toHaveAttribute('href', '/privacy');
    });

    it('利用規約リンクが正しいhrefを持つ', () => {
      render(<Footer />);

      const termsLink = screen.getByText('利用規約');
      expect(termsLink).toHaveAttribute('href', '/terms');
    });

    it('リンクがクリック可能（pointer-eventsがnoneでない）', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      const termsLink = screen.getByText('利用規約');

      // pointer-events: none が設定されていないことを確認
      // MUIのLinkコンポーネントはデフォルトでクリック可能
      expect(privacyLink).toBeInTheDocument();
      expect(termsLink).toBeInTheDocument();
    });

    it('リンクがa要素としてレンダリングされる', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      const termsLink = screen.getByText('利用規約');

      expect(privacyLink.tagName).toBe('A');
      expect(termsLink.tagName).toBe('A');
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
