/**
 * Unit tests for UsersTable component
 */

import { render, screen, waitFor } from '@testing-library/react';
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
        expect(screen.getByText('テストユーザー1')).toBeInTheDocument();
      });

      expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      expect(screen.getByText('テストユーザー2')).toBeInTheDocument();
      expect(screen.getByText('user2@example.com')).toBeInTheDocument();
      expect(screen.getByText('admin')).toBeInTheDocument();
      expect(screen.getByText('user-manager')).toBeInTheDocument();
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
        expect(screen.getByText('ロールなしユーザー')).toBeInTheDocument();
      });

      expect(screen.getByText('なし')).toBeInTheDocument();
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
        expect(screen.getByText('テストユーザー')).toBeInTheDocument();
      });

      expect(screen.getByRole('link', { name: '編集' })).toBeInTheDocument();
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
        expect(screen.getByText('テストユーザー')).toBeInTheDocument();
      });

      expect(screen.queryByRole('link', { name: '編集' })).not.toBeInTheDocument();
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
