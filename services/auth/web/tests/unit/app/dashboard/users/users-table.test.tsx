/**
 * Unit tests for UsersTable component
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import { UsersTable } from '../../../../../src/app/dashboard/users/users-table';

// Mock fetch
global.fetch = jest.fn();

describe('UsersTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ローディング状態', () => {
    it('ローディング中はスピナーを表示する', () => {
      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<UsersTable canAssignRoles={false} />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('ロールの表示', () => {
    it('ROLES に無い ID は ID のまま表示し、ID 自体は表示しない', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          users: [
            {
              userId: 'user-1',
              name: 'テストユーザー',
              email: 'user@example.com',
              roles: ['legacy-role', 'constructor', 'admin'],
            },
          ],
        }),
      });

      render(<UsersTable canAssignRoles={false} />);

      await waitFor(() => {
        expect(
          within(screen.getByTestId('users-table')).getByText('legacy-role')
        ).toBeInTheDocument();
      });
      const table = within(screen.getByTestId('users-table'));
      expect(table.getByText('constructor')).toBeInTheDocument();
      expect(table.getByText('管理者')).toBeInTheDocument();
      expect(table.queryByText('admin')).not.toBeInTheDocument();
    });
  });

  describe('ユーザー一覧の取得', () => {
    it('ユーザー一覧を正しく表示する', async () => {
      const mockUsers = [
        {
          userId: 'user-1',
          name: 'テストユーザー1',
          email: 'user1@example.com',
          roles: ['admin'],
        },
        {
          userId: 'user-2',
          name: 'テストユーザー2',
          email: 'user2@example.com',
          roles: ['user-manager'],
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ users: mockUsers }),
      });

      render(<UsersTable canAssignRoles={false} />);

      await waitFor(() => {
        expect(screen.getAllByText('テストユーザー1').length).toBeGreaterThan(0);
      });

      const table = within(screen.getByTestId('users-table'));
      expect(table.getByText('テストユーザー1')).toBeInTheDocument();
      expect(table.getByText('user1@example.com')).toBeInTheDocument();
      expect(table.getByText('テストユーザー2')).toBeInTheDocument();
      expect(table.getByText('user2@example.com')).toBeInTheDocument();
      expect(table.getByText('管理者')).toBeInTheDocument();
      expect(table.getByText('ユーザー管理者')).toBeInTheDocument();
    });

    it('ロールがない場合は「なし」を表示する', async () => {
      const mockUsers = [
        {
          userId: 'user-1',
          name: 'ロールなしユーザー',
          email: 'norole@example.com',
          roles: [],
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ users: mockUsers }),
      });

      render(<UsersTable canAssignRoles={false} />);

      await waitFor(() => {
        expect(screen.getAllByText('ロールなしユーザー').length).toBeGreaterThan(0);
      });

      expect(within(screen.getByTestId('users-table')).getByText('なし')).toBeInTheDocument();
    });
  });

  describe('レスポンス構造のバリデーション', () => {
    it('不正なレスポンス形式の場合はエラーを表示する', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => null, // null response
      });

      render(<UsersTable canAssignRoles={false} />);

      await waitFor(() => {
        expect(screen.getByText('不正なレスポンス形式です')).toBeInTheDocument();
      });
    });

    it('users が配列でない場合は空配列として扱う', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ users: null }),
      });

      render(<UsersTable canAssignRoles={false} />);

      await waitFor(() => {
        expect(screen.getByText('ユーザーが見つかりませんでした')).toBeInTheDocument();
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('APIエラーの場合はエラーメッセージを表示する', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
      });

      render(<UsersTable canAssignRoles={false} />);

      await waitFor(() => {
        expect(screen.getByText('ユーザー一覧の取得に失敗しました')).toBeInTheDocument();
      });
    });

    it('ネットワークエラーの場合はエラーメッセージを表示する', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<UsersTable canAssignRoles={false} />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('編集ボタン表示', () => {
    it('canAssignRoles が true の場合は編集ボタンを表示する', async () => {
      const mockUsers = [
        {
          userId: 'user-1',
          name: 'テストユーザー',
          email: 'user@example.com',
          roles: ['admin'],
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ users: mockUsers }),
      });

      render(<UsersTable canAssignRoles={true} />);

      await waitFor(() => {
        expect(screen.getAllByText('テストユーザー').length).toBeGreaterThan(0);
      });

      const link = within(screen.getByTestId('users-table')).getByRole('link', { name: '編集' });
      expect(link).toHaveAttribute('href', '/dashboard/users/user-1/edit');
    });

    it('canAssignRoles が false の場合は編集ボタンを表示しない', async () => {
      const mockUsers = [
        {
          userId: 'user-1',
          name: 'テストユーザー',
          email: 'user@example.com',
          roles: ['admin'],
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ users: mockUsers }),
      });

      render(<UsersTable canAssignRoles={false} />);

      await waitFor(() => {
        expect(screen.getAllByText('テストユーザー').length).toBeGreaterThan(0);
      });

      expect(screen.queryByRole('link', { name: '編集' })).not.toBeInTheDocument();
    });
  });

  describe('カード表示 (狭い幅)', () => {
    const mockUsers = [
      {
        userId: 'user-1',
        name: 'カードユーザー',
        email: 'card@example.com',
        roles: ['admin'],
      },
      {
        userId: 'user-2',
        name: 'ロールなしカード',
        email: 'norole-card@example.com',
        roles: [],
      },
    ];

    async function renderCards(canAssignRoles: boolean) {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ users: mockUsers }),
      });
      render(<UsersTable canAssignRoles={canAssignRoles} />);
      await waitFor(() => {
        expect(screen.getByTestId('users-cards')).toBeInTheDocument();
      });
      return within(screen.getByTestId('users-cards'));
    }

    it('ユーザー 1 人に 1 枚、名前・メールアドレス・ロールを項目名つきで表示する', async () => {
      const cards = await renderCards(false);

      expect(cards.getByText('カードユーザー')).toBeInTheDocument();
      expect(cards.getByText('card@example.com')).toBeInTheDocument();
      expect(cards.getByText('ロールなしカード')).toBeInTheDocument();
      expect(cards.getByText('norole-card@example.com')).toBeInTheDocument();
      expect(cards.getAllByText('メールアドレス')).toHaveLength(2);
      expect(cards.getAllByText('ロール')).toHaveLength(2);
      expect(cards.getByText('管理者')).toBeInTheDocument();
      expect(cards.getByText('なし')).toBeInTheDocument();
    });

    it('canAssignRoles が true の場合は各カードに編集リンクを表示する', async () => {
      const cards = await renderCards(true);

      const links = cards.getAllByRole('link', { name: '編集' });
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/dashboard/users/user-1/edit',
        '/dashboard/users/user-2/edit',
      ]);
    });

    it('canAssignRoles が false の場合はカードに編集リンクを表示しない', async () => {
      const cards = await renderCards(false);

      expect(cards.queryByRole('link', { name: '編集' })).not.toBeInTheDocument();
    });
  });

  describe('空のユーザー一覧', () => {
    it('ユーザーが存在しない場合はメッセージを表示する', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ users: [] }),
      });

      render(<UsersTable canAssignRoles={false} />);

      await waitFor(() => {
        expect(screen.getByText('ユーザーが見つかりませんでした')).toBeInTheDocument();
      });
    });
  });
});
