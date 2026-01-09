/**
 * Unit tests for UserEditForm component
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { UserEditForm } from '../../../../../src/app/dashboard/users/[userId]/edit/user-edit-form';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('UserEditForm', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
  });

  describe('ユーザー情報の取得', () => {
    it('ユーザー情報を正しく表示する', async () => {
      const mockUser = {
        userId: 'user-123',
        name: 'テストユーザー',
        email: 'test@example.com',
        roles: ['admin'],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockUser,
      });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText(/名前:/)).toBeInTheDocument();
      });

      expect(screen.getByText('テストユーザー')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
      expect(screen.getByText('user-123')).toBeInTheDocument();
    });

    it('ロールのチェックボックスが正しく初期化される', async () => {
      const mockUser = {
        userId: 'user-123',
        name: 'テストユーザー',
        email: 'test@example.com',
        roles: ['admin'],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockUser,
      });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByLabelText('admin')).toBeChecked();
      });

      expect(screen.getByLabelText('user-manager')).not.toBeChecked();
    });
  });

  describe('レスポンス構造のバリデーション', () => {
    it('不正なレスポンス形式の場合はエラーを表示する', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}), // userId がない
      });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('不正なレスポンス形式です')).toBeInTheDocument();
      });
    });

    it('roles が配列でない場合は空配列として扱う', async () => {
      const mockUser = {
        userId: 'user-123',
        name: 'テストユーザー',
        email: 'test@example.com',
        roles: null,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockUser,
      });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('テストユーザー')).toBeInTheDocument();
      });

      // すべてのチェックボックスがチェックされていないことを確認
      expect(screen.getByLabelText('admin')).not.toBeChecked();
      expect(screen.getByLabelText('user-manager')).not.toBeChecked();
    });
  });

  describe('ロールの選択/解除', () => {
    it('ロールをチェックできる', async () => {
      const mockUser = {
        userId: 'user-123',
        name: 'テストユーザー',
        email: 'test@example.com',
        roles: [],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockUser,
      });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByLabelText('admin')).toBeInTheDocument();
      });

      const adminCheckbox = screen.getByLabelText('admin');
      fireEvent.click(adminCheckbox);

      expect(adminCheckbox).toBeChecked();
    });

    it('ロールをチェック解除できる', async () => {
      const mockUser = {
        userId: 'user-123',
        name: 'テストユーザー',
        email: 'test@example.com',
        roles: ['admin'],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockUser,
      });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByLabelText('admin')).toBeChecked();
      });

      const adminCheckbox = screen.getByLabelText('admin');
      fireEvent.click(adminCheckbox);

      expect(adminCheckbox).not.toBeChecked();
    });
  });

  describe('フォーム送信', () => {
    it('保存に成功した場合はユーザー一覧にリダイレクトする', async () => {
      const mockUser = {
        userId: 'user-123',
        name: 'テストユーザー',
        email: 'test@example.com',
        roles: [],
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUser,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ...mockUser, roles: ['admin'] }),
        });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
      });

      const adminCheckbox = screen.getByLabelText('admin');
      fireEvent.click(adminCheckbox);

      const saveButton = screen.getByRole('button', { name: '保存' });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard/users');
      });
    });

    it('保存中はボタンが無効化される', async () => {
      const mockUser = {
        userId: 'user-123',
        name: 'テストユーザー',
        email: 'test@example.com',
        roles: [],
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUser,
        })
        .mockImplementationOnce(() => new Promise(() => {})); // Never resolves

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: '保存' });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled();
      });
    });

    it('保存に失敗した場合はエラーメッセージを表示する', async () => {
      const mockUser = {
        userId: 'user-123',
        name: 'テストユーザー',
        email: 'test@example.com',
        roles: [],
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUser,
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'ロールの割り当てに失敗しました' }),
        });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: '保存' });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('ロールの割り当てに失敗しました')).toBeInTheDocument();
      });
    });
  });

  describe('キャンセルボタン', () => {
    it('キャンセルボタンをクリックするとユーザー一覧に戻る', async () => {
      const mockUser = {
        userId: 'user-123',
        name: 'テストユーザー',
        email: 'test@example.com',
        roles: [],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockUser,
      });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      fireEvent.click(cancelButton);

      expect(mockPush).toHaveBeenCalledWith('/dashboard/users');
    });
  });

  describe('エラーハンドリング', () => {
    it('ユーザー情報の取得に失敗した場合はエラーを表示する', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
      });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('ユーザー情報の取得に失敗しました')).toBeInTheDocument();
      });
    });

    it('ユーザーが見つからない場合はメッセージを表示する', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => null,
      });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('不正なレスポンス形式です')).toBeInTheDocument();
      });
    });
  });
});
