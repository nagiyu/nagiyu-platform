import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

// next-auth/react は ESM 配布のため、jest（ts-jest, node_modules 未変換）では
// そのまま import できない。useSession だけを差し替える。
const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

const mockBuildSignOutUrl = jest.fn();
jest.mock('../../../../src/utils/auth', () => ({
  buildSignOutUrl: (authUrl: string, callbackUrl?: string) =>
    mockBuildSignOutUrl(authUrl, callbackUrl),
}));

import SessionHeader from '../../../../src/components/layout/SessionHeader';
import type { NavigationItem } from '../../../../src/components/layout/Header';

const AUTH_URL = 'https://auth.example.com';

const authenticated = (user: Record<string, unknown>) => ({
  data: { user, expires: '2999-01-01T00:00:00.000Z' },
  status: 'authenticated',
});

describe('SessionHeader', () => {
  beforeEach(() => {
    mockUseSession.mockReset();
    mockBuildSignOutUrl.mockReset();
    window.location.hash = '';
  });

  describe('未ログイン・読み込み中', () => {
    it('未ログインのときアカウントメニューを表示しない', () => {
      mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
      render(<SessionHeader authUrl={AUTH_URL} title="LiveTalk" />);

      expect(screen.getByText('LiveTalk')).toBeInTheDocument();
      expect(screen.queryByLabelText('アカウントメニュー')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument();
    });

    it('読み込み中のときアカウントメニューを表示しない', () => {
      mockUseSession.mockReturnValue({ data: undefined, status: 'loading' });
      render(<SessionHeader authUrl={AUTH_URL} />);

      expect(screen.queryByLabelText('アカウントメニュー')).not.toBeInTheDocument();
    });

    it('roles が渡らないため requiredPermission を持つ項目は表示されない', () => {
      mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
      const items: NavigationItem[] = [
        { label: 'チャット', href: '/chat', requiredPermission: 'livetalk:chat' },
      ];
      render(<SessionHeader authUrl={AUTH_URL} navigationItems={items} />);

      expect(screen.queryByRole('link', { name: 'チャット' })).not.toBeInTheDocument();
    });
  });

  describe('ログイン中', () => {
    it('セッションの name / email / image をアカウントメニューに反映する', async () => {
      const user = userEvent.setup();
      mockUseSession.mockReturnValue(
        authenticated({
          name: 'テストユーザー',
          email: 'test@example.com',
          image: 'https://example.com/avatar.jpg',
          roles: [],
        })
      );
      const { container } = render(<SessionHeader authUrl={AUTH_URL} />);

      expect(container.querySelector('.MuiAvatar-root img')).toHaveAttribute(
        'src',
        'https://example.com/avatar.jpg'
      );

      await user.click(screen.getByLabelText('アカウントメニュー'));
      expect(screen.getByText('テストユーザー')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('name / email / image が null のときも描画できる', async () => {
      const user = userEvent.setup();
      mockUseSession.mockReturnValue(authenticated({ name: null, email: null, image: null }));
      render(<SessionHeader authUrl={AUTH_URL} />);

      await user.click(screen.getByLabelText('アカウントメニュー'));
      expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('session.user.roles を requiredPermission の判定に使う', () => {
      mockUseSession.mockReturnValue(authenticated({ name: 'a', roles: ['livetalk-user'] }));
      const items: NavigationItem[] = [
        { label: 'チャット', href: '/chat', requiredPermission: 'livetalk:chat' },
        { label: 'ステータス', href: '/status', requiredPermission: 'livetalk:admin' },
      ];
      render(<SessionHeader authUrl={AUTH_URL} navigationItems={items} />);

      expect(screen.getByRole('link', { name: 'チャット' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'ステータス' })).not.toBeInTheDocument();
    });

    it('roles が配列でないとき権限なしとして扱う', () => {
      mockUseSession.mockReturnValue(authenticated({ name: 'a', roles: 'livetalk-user' }));
      const items: NavigationItem[] = [
        { label: 'チャット', href: '/chat', requiredPermission: 'livetalk:chat' },
      ];
      render(<SessionHeader authUrl={AUTH_URL} navigationItems={items} />);

      expect(screen.queryByRole('link', { name: 'チャット' })).not.toBeInTheDocument();
    });

    it('roles が未設定のとき権限なしとして扱う', () => {
      mockUseSession.mockReturnValue(authenticated({ name: 'a' }));
      const items: NavigationItem[] = [
        { label: 'チャット', href: '/chat', requiredPermission: 'livetalk:chat' },
      ];
      render(<SessionHeader authUrl={AUTH_URL} navigationItems={items} />);

      expect(screen.queryByRole('link', { name: 'チャット' })).not.toBeInTheDocument();
    });

    it('title / actions / onDeleteAccount など他の props を Header にそのまま渡す', async () => {
      const user = userEvent.setup();
      const onDeleteAccount = jest.fn();
      mockUseSession.mockReturnValue(authenticated({ name: 'a', roles: [] }));
      render(
        <SessionHeader
          authUrl={AUTH_URL}
          title="LiveTalk"
          href="/home"
          actions={<span data-testid="invite-badge">2</span>}
          onDeleteAccount={onDeleteAccount}
        />
      );

      expect(screen.getByText('LiveTalk')).toHaveAttribute('href', '/home');
      expect(screen.getByTestId('invite-badge')).toBeInTheDocument();

      await user.click(screen.getByLabelText('アカウントメニュー'));
      await user.click(screen.getByTestId('account-menu-delete-account'));
      expect(onDeleteAccount).toHaveBeenCalledTimes(1);
    });

    it('ログアウトで auth サービスのサインアウト URL へ現在のオリジンを戻り先にして遷移する', async () => {
      const user = userEvent.setup();
      // jsdom では window.location.assign を差し替えられないため、buildSignOutUrl を
      // 同一ドキュメント内の hash 遷移になる URL に差し替え、遷移先と引数の両方で検証する。
      mockBuildSignOutUrl.mockReturnValue(`${window.location.origin}/#signed-out`);
      mockUseSession.mockReturnValue(authenticated({ name: 'a', roles: [] }));
      render(<SessionHeader authUrl={AUTH_URL} />);

      await user.click(screen.getByLabelText('アカウントメニュー'));
      await user.click(screen.getByTestId('account-menu-logout'));

      expect(mockBuildSignOutUrl).toHaveBeenCalledTimes(1);
      expect(mockBuildSignOutUrl).toHaveBeenCalledWith(AUTH_URL, window.location.origin);
      expect(window.location.hash).toBe('#signed-out');
    });
  });

  describe('アクセシビリティ', () => {
    it('ログイン中で a11y 違反がない', async () => {
      mockUseSession.mockReturnValue(authenticated({ name: 'テスト', roles: ['admin'] }));
      const { container } = render(
        <SessionHeader
          authUrl={AUTH_URL}
          title="LiveTalk"
          navigationItems={[{ label: 'ホーム', href: '/' }]}
        />
      );

      expect(await axe(container)).toHaveNoViolations();
    });

    it('未ログインで a11y 違反がない', async () => {
      mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
      const { container } = render(<SessionHeader authUrl={AUTH_URL} title="LiveTalk" />);

      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
