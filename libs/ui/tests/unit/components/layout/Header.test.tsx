import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
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
      expect(
        screen.getByRole('navigation', { name: 'ナビゲーションメニュー' })
      ).toBeInTheDocument();
    });

    it('ドロップダウンサブメニューの項目クリックでメニューが閉じる', async () => {
      const user = userEvent.setup();
      render(<Header navigationItems={navigationItems} />);

      // 管理メニューを開く
      const adminButton = screen.getByRole('button', { name: '管理 メニュー' });
      await user.click(adminButton);

      // サブメニューが表示される
      const userItem = screen.getByText('ユーザー');
      expect(userItem).toBeInTheDocument();

      // サブメニュー項目クリック
      await user.click(userItem);

      // メニューが閉じる（サブメニュー項目が非表示になる）
      expect(screen.queryByRole('menuitem', { name: 'ユーザー' })).not.toBeInTheDocument();
    });

    it('Drawerのサブメニュー（ネスト）が展開できる', async () => {
      const user = userEvent.setup();
      render(<Header navigationItems={navigationItems} />);

      // ドロワーを開く
      const menuButton = screen.getByLabelText('メニューを開く');
      await user.click(menuButton);

      // Drawer 内の「管理」ボタンをクリックしてサブメニューを展開する
      const drawerNavigation = screen.getByRole('navigation', { name: 'ナビゲーションメニュー' });
      const adminButtons = within(drawerNavigation).getAllByText('管理');
      await user.click(adminButtons[0]);

      // サブメニューが展開される
      expect(screen.getByRole('link', { name: 'ユーザー' })).toBeInTheDocument();
    });

    it('Drawer 内のナビゲーションボックスが存在する', async () => {
      const user = userEvent.setup();
      render(<Header navigationItems={navigationItems} />);

      // ドロワーを開く
      const menuButton = screen.getByLabelText('メニューを開く');
      await user.click(menuButton);

      // Drawer が開いている状態であることを確認
      const navBox = screen.getByRole('navigation', { name: 'ナビゲーションメニュー' });
      expect(navBox).toBeInTheDocument();

      // Drawer 内のすべてのリンクが表示されている
      const links = within(navBox).getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);
    });
  });

  describe('アカウントメニュー機能（user 指定あり）', () => {
    const testUser = { name: 'テストユーザー', email: 'test@example.com' };

    it('userがない場合、アカウントメニュートリガーが表示されない', () => {
      render(<Header />);

      expect(screen.queryByLabelText('アカウントメニュー')).not.toBeInTheDocument();
    });

    it('userがある場合、アカウントメニュートリガー（アバターボタン）が表示される', () => {
      render(<Header user={testUser} />);

      const trigger = screen.getByLabelText('アカウントメニュー');
      expect(trigger).toBeInTheDocument();
    });

    it('アカウントメニュートリガーに aria-haspopup が設定されている', () => {
      render(<Header user={testUser} />);

      const trigger = screen.getByLabelText('アカウントメニュー');
      expect(trigger).toHaveAttribute('aria-haspopup', 'true');
    });

    it('アカウントメニューを開くとユーザー名が表示される', async () => {
      const user = userEvent.setup();
      render(<Header user={testUser} />);

      const trigger = screen.getByLabelText('アカウントメニュー');
      await user.click(trigger);

      expect(screen.getByText('テストユーザー')).toBeInTheDocument();
    });

    it('アカウントメニューを開くとメールアドレスが表示される', async () => {
      const user = userEvent.setup();
      render(<Header user={testUser} />);

      const trigger = screen.getByLabelText('アカウントメニュー');
      await user.click(trigger);

      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('onLogout が指定されている場合、メニューにログアウト項目が表示される', async () => {
      const user = userEvent.setup();
      const handleLogout = jest.fn();
      render(<Header user={testUser} onLogout={handleLogout} />);

      const trigger = screen.getByLabelText('アカウントメニュー');
      await user.click(trigger);

      expect(screen.getByTestId('account-menu-logout')).toBeInTheDocument();
    });

    it('ログアウト項目をクリックすると onLogout が呼ばれる', async () => {
      const user = userEvent.setup();
      const handleLogout = jest.fn();
      render(<Header user={testUser} onLogout={handleLogout} />);

      const trigger = screen.getByLabelText('アカウントメニュー');
      await user.click(trigger);

      const logoutItem = screen.getByTestId('account-menu-logout');
      await user.click(logoutItem);

      expect(handleLogout).toHaveBeenCalledTimes(1);
    });

    it('onDeleteAccount が指定されている場合、メニューに退会項目が表示される', async () => {
      const user = userEvent.setup();
      const handleDeleteAccount = jest.fn();
      render(<Header user={testUser} onDeleteAccount={handleDeleteAccount} />);

      const trigger = screen.getByLabelText('アカウントメニュー');
      await user.click(trigger);

      expect(screen.getByTestId('account-menu-delete-account')).toBeInTheDocument();
    });

    it('退会項目をクリックすると onDeleteAccount が呼ばれる', async () => {
      const user = userEvent.setup();
      const handleDeleteAccount = jest.fn();
      render(<Header user={testUser} onDeleteAccount={handleDeleteAccount} />);

      const trigger = screen.getByLabelText('アカウントメニュー');
      await user.click(trigger);

      const deleteItem = screen.getByTestId('account-menu-delete-account');
      await user.click(deleteItem);

      expect(handleDeleteAccount).toHaveBeenCalledTimes(1);
    });

    it('onDeleteAccount が未指定のとき、退会項目が表示されない', async () => {
      const user = userEvent.setup();
      render(<Header user={testUser} onLogout={jest.fn()} />);

      const trigger = screen.getByLabelText('アカウントメニュー');
      await user.click(trigger);

      expect(screen.queryByTestId('account-menu-delete-account')).not.toBeInTheDocument();
    });

    it('deleteAccountLabel でカスタムラベルを設定できる', async () => {
      const user = userEvent.setup();
      const handleDeleteAccount = jest.fn();
      render(
        <Header
          user={testUser}
          onDeleteAccount={handleDeleteAccount}
          deleteAccountLabel="アカウントを削除"
        />
      );

      const trigger = screen.getByLabelText('アカウントメニュー');
      await user.click(trigger);

      expect(screen.getByText('アカウントを削除')).toBeInTheDocument();
    });

    it('avatarがある場合、アカウントメニュートリガー内にアバター画像が表示される', () => {
      const userWithAvatar = {
        name: 'テストユーザー',
        email: 'test@example.com',
        avatar: 'https://example.com/avatar.jpg',
      };
      const { container } = render(<Header user={userWithAvatar} />);

      const avatar = container.querySelector('.MuiAvatar-root img');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    });

    it('avatarがない場合、イニシャルが表示される', () => {
      render(<Header user={{ name: 'テストユーザー' }} />);

      expect(screen.getByText('テ')).toBeInTheDocument();
    });
  });

  describe('ログアウト機能（後方互換: user 未指定時の単独ボタン）', () => {
    it('onLogoutがない場合、ログアウトボタンが表示されない', () => {
      render(<Header />);

      expect(screen.queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument();
    });

    it('user 未指定で onLogout がある場合、単独のログアウトボタンが表示される（後方互換）', () => {
      const handleLogout = jest.fn();
      render(<Header onLogout={handleLogout} />);

      expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument();
    });

    it('user 未指定で onLogout ボタンをクリックすると onLogout が呼ばれる（後方互換）', async () => {
      const user = userEvent.setup();
      const handleLogout = jest.fn();
      render(<Header onLogout={handleLogout} />);

      const logoutButton = screen.getByRole('button', { name: 'ログアウト' });
      await user.click(logoutButton);

      expect(handleLogout).toHaveBeenCalledTimes(1);
    });

    it('カスタムlogoutLabelが単独ボタンに表示される（後方互換）', () => {
      const handleLogout = jest.fn();
      render(<Header onLogout={handleLogout} logoutLabel="サインアウト" />);

      expect(screen.getByRole('button', { name: 'サインアウト' })).toBeInTheDocument();
    });
  });

  describe('roles による項目の絞り込み', () => {
    const items: NavigationItem[] = [
      { label: 'ホーム', href: '/' },
      { label: 'チャット', href: '/chat', requiredPermission: 'livetalk:chat' },
      { label: 'ステータス', href: '/status', requiredPermission: 'livetalk:admin' },
      {
        label: '管理',
        href: '#',
        children: [
          { label: 'ユーザー', href: '/admin/users', requiredPermission: 'users:read' },
          { label: 'ロール', href: '/admin/roles', requiredPermission: 'roles:assign' },
        ],
      },
    ];

    it('requiredPermission がない項目は roles 未指定でも表示される', () => {
      render(<Header navigationItems={items} />);

      expect(screen.getByRole('link', { name: 'ホーム' })).toBeInTheDocument();
    });

    it('roles 未指定のとき、requiredPermission を持つ項目は権限なしとして非表示になる', () => {
      render(<Header navigationItems={items} />);

      expect(screen.queryByRole('link', { name: 'チャット' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'ステータス' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '管理 メニュー' })).not.toBeInTheDocument();
    });

    it('権限を満たす項目だけが表示される', () => {
      render(<Header navigationItems={items} roles={['livetalk-user']} />);

      expect(screen.getByRole('link', { name: 'チャット' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'ステータス' })).not.toBeInTheDocument();
    });

    it('子メニューにも同じ判定がかかる', async () => {
      const user = userEvent.setup();
      render(<Header navigationItems={items} roles={['user-manager']} />);

      await user.click(screen.getByRole('button', { name: '管理 メニュー' }));

      expect(screen.getByRole('menuitem', { name: 'ユーザー' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'ロール' })).not.toBeInTheDocument();
    });

    it('子がすべて絞り込まれた親項目は表示されない', () => {
      render(<Header navigationItems={items} roles={['livetalk-user']} />);

      expect(screen.queryByRole('button', { name: '管理 メニュー' })).not.toBeInTheDocument();
    });

    it('親項目自体が requiredPermission を持つ場合、満たさなければ子が通っても表示されない', () => {
      const guarded: NavigationItem[] = [
        {
          label: '管理',
          href: '#',
          requiredPermission: 'roles:assign',
          children: [{ label: 'ユーザー', href: '/admin/users', requiredPermission: 'users:read' }],
        },
      ];
      render(<Header navigationItems={guarded} roles={['user-manager']} />);

      expect(screen.queryByRole('button', { name: '管理 メニュー' })).not.toBeInTheDocument();
    });

    it('元から子が空配列の項目は絞り込みで消えない', () => {
      render(<Header navigationItems={[{ label: '空', href: '#', children: [] }]} />);

      expect(screen.getByRole('button', { name: '空 メニュー' })).toBeInTheDocument();
    });

    it('Drawer にも同じ絞り込みが効く', async () => {
      const user = userEvent.setup();
      render(<Header navigationItems={items} roles={['user-manager']} />);

      await user.click(screen.getByLabelText('メニューを開く'));
      const drawer = screen.getByRole('navigation', { name: 'ナビゲーションメニュー' });

      expect(within(drawer).getByText('ホーム')).toBeInTheDocument();
      expect(within(drawer).queryByText('チャット')).not.toBeInTheDocument();

      await user.click(within(drawer).getByText('管理'));
      expect(within(drawer).getByText('ユーザー')).toBeInTheDocument();
      expect(within(drawer).queryByText('ロール')).not.toBeInTheDocument();
    });

    it('表示できる項目が 0 件のとき、ハンバーガーメニューも表示されない', () => {
      const guardedOnly: NavigationItem[] = [
        { label: 'チャット', href: '/chat', requiredPermission: 'livetalk:chat' },
      ];
      render(<Header navigationItems={guardedOnly} roles={[]} />);

      expect(screen.queryByLabelText('メニューを開く')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('navigation', { name: 'ナビゲーションメニュー' })
      ).not.toBeInTheDocument();
    });

    it('roles と navigationItems を指定した状態で a11y 違反がない', async () => {
      const { container } = render(
        <Header title="LiveTalk" navigationItems={items} roles={['admin']} />
      );

      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe('actions', () => {
    it('actions が描画される', () => {
      render(<Header actions={<span data-testid="invite-badge">3</span>} />);

      expect(screen.getByTestId('invite-badge')).toHaveTextContent('3');
    });

    it('actions が未指定のとき何も追加されない', () => {
      render(<Header />);

      expect(screen.queryByTestId('invite-badge')).not.toBeInTheDocument();
    });

    it('actions はアカウントメニューの手前に描画される', () => {
      render(<Header user={{ name: 'テスト' }} actions={<span data-testid="invite-badge" />} />);

      const badge = screen.getByTestId('invite-badge');
      const trigger = screen.getByLabelText('アカウントメニュー');

      expect(
        badge.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    it('actions は単独ログアウトボタンの手前に描画される', () => {
      render(<Header onLogout={jest.fn()} actions={<span data-testid="invite-badge" />} />);

      const badge = screen.getByTestId('invite-badge');
      const logout = screen.getByRole('button', { name: 'ログアウト' });

      expect(badge.compareDocumentPosition(logout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('navigationItems が全件絞り込まれてもモバイル用に actions は表示される', () => {
      render(
        <Header
          navigationItems={[
            { label: 'チャット', href: '/chat', requiredPermission: 'livetalk:chat' },
          ]}
          actions={<span data-testid="invite-badge" />}
        />
      );

      expect(screen.getByTestId('invite-badge')).toBeInTheDocument();
    });

    it('actions とアカウントメニューを指定した状態で a11y 違反がない', async () => {
      const { container } = render(
        <Header
          user={{ name: 'テスト' }}
          actions={
            <span aria-label="招待 3 件" role="img">
              3
            </span>
          }
        />
      );

      expect(await axe(container)).toHaveNoViolations();
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
      expect(screen.queryByLabelText('アカウントメニュー')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument();
    });

    it('portal/niconico 相当（navigationItems のみ使用）の使い方が壊れない', () => {
      const navItems: NavigationItem[] = [
        { label: 'ホーム', href: '/' },
        { label: 'ポータル', href: '/portal' },
      ];
      render(<Header title="Portal" navigationItems={navItems} />);

      // ナビゲーション項目が表示される
      expect(screen.getByRole('link', { name: 'ホーム' })).toBeInTheDocument();

      // アカウントメニューや単独ログアウトは表示されない
      expect(screen.queryByLabelText('アカウントメニュー')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument();
    });

    it('一部の新しいpropsのみを使用できる（user のみ指定）', () => {
      const user = { name: 'テストユーザー' };
      render(<Header title="Tools" user={user} />);

      expect(screen.getByText('Tools')).toBeInTheDocument();
      // アカウントメニュートリガーが表示される
      expect(screen.getByLabelText('アカウントメニュー')).toBeInTheDocument();

      // 単独ログアウトボタンは表示されない
      expect(screen.queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument();
    });
  });
});
