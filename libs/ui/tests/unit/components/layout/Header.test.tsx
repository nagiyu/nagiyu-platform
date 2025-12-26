import { render, screen } from '@testing-library/react';
import Header from '../../../../src/components/layout/Header';

describe('Header', () => {
  describe('レンダリング', () => {
    it('デフォルトpropsで正しくレンダリングされる', () => {
      render(<Header />);

      const titleElement = screen.getByText('Nagiyu Platform');
      expect(titleElement).toBeInTheDocument();
      expect(titleElement).toHaveAttribute('href', '/');
    });

    it('カスタムtitleが正しくレンダリングされる', () => {
      render(<Header title="Tools" />);

      const titleElement = screen.getByText('Tools');
      expect(titleElement).toBeInTheDocument();
      expect(titleElement).toHaveAttribute('href', '/');
    });

    it('カスタムhrefが正しく設定される', () => {
      render(<Header href="/tools" />);

      const titleElement = screen.getByText('Nagiyu Platform');
      expect(titleElement).toBeInTheDocument();
      expect(titleElement).toHaveAttribute('href', '/tools');
    });

    it('titleとhref両方がカスタマイズされる', () => {
      render(<Header title="Custom Service" href="/custom" />);

      const titleElement = screen.getByText('Custom Service');
      expect(titleElement).toBeInTheDocument();
      expect(titleElement).toHaveAttribute('href', '/custom');
    });
  });

  describe('アクセシビリティ', () => {
    it('デフォルトのaria-labelが正しく設定される', () => {
      render(<Header />);

      const titleElement = screen.getByLabelText('Nagiyu Platform - Navigate to homepage');
      expect(titleElement).toBeInTheDocument();
    });

    it('カスタムタイトルに基づいたaria-labelが設定される', () => {
      render(<Header title="Tools" />);

      const titleElement = screen.getByLabelText('Tools - Navigate to homepage');
      expect(titleElement).toBeInTheDocument();
    });

    it('カスタムaria-labelが正しく設定される', () => {
      render(<Header ariaLabel="Custom accessibility label" />);

      const titleElement = screen.getByLabelText('Custom accessibility label');
      expect(titleElement).toBeInTheDocument();
    });

    it('日本語のaria-labelを設定できる', () => {
      render(<Header title="Tools" ariaLabel="Tools ホームページに戻る" />);

      const titleElement = screen.getByLabelText('Tools ホームページに戻る');
      expect(titleElement).toBeInTheDocument();
    });

    it('リンクとして機能するTypography要素が存在する', () => {
      render(<Header />);

      const linkElement = screen.getByRole('link');
      expect(linkElement).toBeInTheDocument();
      expect(linkElement).toHaveAttribute('href', '/');
    });
  });

  describe('スタイリング', () => {
    it('Typography要素にh6 variantが適用される', () => {
      render(<Header />);

      const titleElement = screen.getByText('Nagiyu Platform');
      expect(titleElement).toHaveClass('MuiTypography-h6');
    });

    it('Typography要素がa要素としてレンダリングされる', () => {
      render(<Header />);

      const titleElement = screen.getByText('Nagiyu Platform');
      expect(titleElement.tagName).toBe('A');
    });
  });

  describe('Material-UI構造', () => {
    it('AppBarコンポーネントが存在する', () => {
      const { container } = render(<Header />);

      const appBar = container.querySelector('.MuiAppBar-root');
      expect(appBar).toBeInTheDocument();
    });

    it('Toolbarコンポーネントが存在する', () => {
      const { container } = render(<Header />);

      const toolbar = container.querySelector('.MuiToolbar-root');
      expect(toolbar).toBeInTheDocument();
    });

    it('AppBarがprimary colorで表示される', () => {
      const { container } = render(<Header />);

      const appBar = container.querySelector('.MuiAppBar-colorPrimary');
      expect(appBar).toBeInTheDocument();
    });
  });
});
