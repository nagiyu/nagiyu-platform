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
        expect(screen.getByLabelText(/^管理者/)).toBeChecked();
      });

      expect(screen.getByLabelText(/^ユーザー管理者/)).not.toBeChecked();
    });
  });

  describe('ロールの表示', () => {
    const mockUser = {
      userId: 'user-123',
      name: 'テストユーザー',
      email: 'test@example.com',
      roles: [],
    };

    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockUser,
      });
    });

    it('ロール ID ではなく名前と説明を表示する', async () => {
      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByLabelText(/^ユーザー管理者/)).toBeInTheDocument();
      });

      expect(screen.getByText('ユーザー管理のみ可能')).toBeInTheDocument();
      expect(screen.queryByText('user-manager')).not.toBeInTheDocument();
      expect(screen.queryByText('admin')).not.toBeInTheDocument();
    });

    it('チェックボックスの送信値はロール ID のままである', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => mockUser })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByLabelText(/^ユーザー管理者/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/^ユーザー管理者/));
      fireEvent.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenLastCalledWith('/api/users/user-123/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roles: ['user-manager'] }),
        });
      });
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
      expect(screen.getByLabelText(/^管理者/)).not.toBeChecked();
      expect(screen.getByLabelText(/^ユーザー管理者/)).not.toBeChecked();
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
        expect(screen.getByLabelText(/^管理者/)).toBeInTheDocument();
      });

      const adminCheckbox = screen.getByLabelText(/^管理者/);
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
        expect(screen.getByLabelText(/^管理者/)).toBeChecked();
      });

      const adminCheckbox = screen.getByLabelText(/^管理者/);
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

      const adminCheckbox = screen.getByLabelText(/^管理者/);
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
    function expectHeadingAndBackLink() {
      expect(screen.getByRole('heading', { level: 1, name: 'ユーザー編集' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'ユーザー一覧へ戻る' })).toHaveAttribute(
        'href',
        '/dashboard/users'
      );
    }

    it('取得に失敗した場合は見出しと一覧への導線とエラーを表示する', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('ユーザー情報の取得に失敗しました')).toBeInTheDocument();
      });
      expectHeadingAndBackLink();
    });

    it('404 の場合はユーザーが見つからないことを表示する', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
      });

      render(<UserEditForm userId="no-such-user" />);

      await waitFor(() => {
        expect(screen.getByText('ユーザーが見つかりません')).toBeInTheDocument();
      });
      expect(screen.queryByText('ユーザー情報の取得に失敗しました')).not.toBeInTheDocument();
      expectHeadingAndBackLink();
    });

    it('通信エラーの場合も見出しと一覧への導線を表示する', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
      expectHeadingAndBackLink();
    });

    it('Error 以外が投げられた場合は既定のエラーを表示する', async () => {
      (global.fetch as jest.Mock).mockRejectedValue('unexpected');

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
      });
      expectHeadingAndBackLink();
    });

    it('読み込み中も見出しと一覧への導線を表示する', () => {
      (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

      render(<UserEditForm userId="user-123" />);

      expectHeadingAndBackLink();
    });

    it('取得に成功した場合も見出しと一覧への導線を表示する', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          userId: 'user-123',
          name: 'テストユーザー',
          email: 'test@example.com',
          roles: [],
        }),
      });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('テストユーザー')).toBeInTheDocument();
      });
      expectHeadingAndBackLink();
    });

    it('レスポンスが null の場合は不正なレスポンス形式を表示する', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => null,
      });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('不正なレスポンス形式です')).toBeInTheDocument();
      });
      expectHeadingAndBackLink();
    });
  });
});
