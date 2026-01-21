import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from '../../../../src/components/layout/Header';
import type { NavigationItem } from '../../../../src/components/layout/Header';

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

  describe('ナビゲーション機能', () => {
    const navigationItems: NavigationItem[] = [
      { label: 'ホーム', href: '/' },
      { label: 'ツール', href: '/tools' },
      {
        label: '管理',
        href: '#',
        children: [
          { label: 'ユーザー', href: '/admin/users' },
          { label: '設定', href: '/admin/settings' },
        ],
      },
    ];

    it('navigationItemsがない場合、ナビゲーションメニューが表示されない', () => {
      render(<Header />);

      expect(screen.queryByLabelText('メニューを開く')).not.toBeInTheDocument();
    });

    it('navigationItemsがある場合、モバイルメニューボタンが表示される', () => {
      render(<Header navigationItems={navigationItems} />);

      const menuButton = screen.getByLabelText('メニューを開く');
      expect(menuButton).toBeInTheDocument();
    });

    it('ナビゲーションメニュー項目が正しく表示される', () => {
      render(<Header navigationItems={navigationItems} />);

      // デスクトップメニュー（子要素がない項目はlink、ある項目はbutton）
      expect(screen.getByRole('link', { name: 'ホーム' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'ツール' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '管理 メニュー' })).toBeInTheDocument();
    });

    it('ドロップダウンメニューが動作する', async () => {
      const user = userEvent.setup();
      render(<Header navigationItems={navigationItems} />);

      const adminButton = screen.getByRole('button', { name: '管理 メニュー' });
      await user.click(adminButton);

      // サブメニューが表示される
      expect(screen.getByText('ユーザー')).toBeInTheDocument();
      expect(screen.getByText('設定')).toBeInTheDocument();
    });

    it('モバイルDrawerが正しく開閉する', async () => {
      const user = userEvent.setup();
      render(<Header navigationItems={navigationItems} />);

      const menuButton = screen.getByLabelText('メニューを開く');
      await user.click(menuButton);

      // Drawerが開く
      expect(screen.getByRole('navigation', { name: 'ナビゲーションメニュー' })).toBeInTheDocument();
    });
  });

  describe('ユーザー情報表示', () => {
    it('userがない場合、ユーザー情報が表示されない', () => {
      render(<Header />);

      expect(screen.queryByLabelText(/ログイン中:/)).not.toBeInTheDocument();
    });

    it('userがある場合、ユーザー名が表示される', () => {
      const user = { name: 'テストユーザー', email: 'test@example.com' };
      render(<Header user={user} />);

      expect(screen.getByLabelText('ログイン中: テストユーザー')).toBeInTheDocument();
      expect(screen.getByText('テストユーザー')).toBeInTheDocument();
    });

    it('avatarがある場合、アバター画像が表示される', () => {
      const user = {
        name: 'テストユーザー',
        email: 'test@example.com',
        avatar: 'https://example.com/avatar.jpg',
      };
      const { container } = render(<Header user={user} />);

      const avatar = container.querySelector('.MuiAvatar-root img');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    });

    it('avatarがない場合、イニシャルが表示される', () => {
      const user = { name: 'テストユーザー' };
      render(<Header user={user} />);

      expect(screen.getByText('テ')).toBeInTheDocument();
    });
  });

  describe('ログアウト機能', () => {
    it('onLogoutがない場合、ログアウトボタンが表示されない', () => {
      render(<Header />);

      expect(screen.queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument();
    });

    it('onLogoutがある場合、ログアウトボタンが表示される', () => {
      const handleLogout = jest.fn();
      render(<Header onLogout={handleLogout} />);

      expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument();
    });

    it('ログアウトボタンをクリックするとonLogoutが呼ばれる', async () => {
      const user = userEvent.setup();
      const handleLogout = jest.fn();
      render(<Header onLogout={handleLogout} />);

      const logoutButton = screen.getByRole('button', { name: 'ログアウト' });
      await user.click(logoutButton);

      expect(handleLogout).toHaveBeenCalledTimes(1);
    });

    it('カスタムlogoutLabelが表示される', () => {
      const handleLogout = jest.fn();
      render(<Header onLogout={handleLogout} logoutLabel="サインアウト" />);

      expect(screen.getByRole('button', { name: 'サインアウト' })).toBeInTheDocument();
    });
  });

  describe('後方互換性', () => {
    it('新しいpropsなしで既存の使い方が壊れない', () => {
      // 既存のサービス（Admin、Authなど）の使い方
      render(<Header title="Admin" />);

      const titleElement = screen.getByText('Admin');
      expect(titleElement).toBeInTheDocument();
      expect(titleElement).toHaveAttribute('href', '/');

      // 新機能が表示されない
      expect(screen.queryByLabelText('メニューを開く')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/ログイン中:/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument();
    });

    it('一部の新しいpropsのみを使用できる', () => {
      const user = { name: 'テストユーザー' };
      render(<Header title="Tools" user={user} />);

      expect(screen.getByText('Tools')).toBeInTheDocument();
      expect(screen.getByLabelText('ログイン中: テストユーザー')).toBeInTheDocument();

      // 他の機能は表示されない
      expect(screen.queryByLabelText('メニューを開く')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument();
    });
  });
});
