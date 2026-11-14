/**
 * Unit tests for UserEditForm component
 */

import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

    it('有料の段のロールはチェックボックスに出さない', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => mockUser });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByLabelText(/^ユーザー管理者/)).toBeInTheDocument();
      });

      expect(screen.queryByLabelText(/^LiveTalk スタンダード/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^Quick Clip スタンダード/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^Quick Clip プロ/)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/^Quick Clip 使い放題/)).toBeInTheDocument();
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

  describe('課金の権利', () => {
    const FUTURE = Date.UTC(2099, 11, 31, 14, 59, 59, 999);
    const baseUser = {
      userId: 'user-123',
      name: 'テストユーザー',
      email: 'test@example.com',
      roles: [],
      roleGrants: [
        {
          grantId: 'm1',
          roleId: 'admin',
          source: 'manual',
          sourceRef: '支援',
          expiresAt: FUTURE,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          grantId: 's1',
          roleId: 'user-manager',
          source: 'stripe',
          expiresAt: FUTURE,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          grantId: 'r1',
          roleId: 'admin',
          source: 'manual',
          expiresAt: FUTURE,
          revokedAt: 5,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          grantId: 'e1',
          roleId: 'user-manager',
          source: 'manual',
          expiresAt: 1000,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    function mockLoad(user: unknown = baseUser) {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => user })
        .mockResolvedValue({ ok: true, json: async () => ({}) });
    }

    async function renderForm() {
      render(<UserEditForm userId="user-123" />);
      await waitFor(() => expect(screen.getByText('課金の権利')).toBeInTheDocument());
    }

    function lastBody() {
      const calls = (global.fetch as jest.Mock).mock.calls;
      return JSON.parse(calls[calls.length - 1][1].body);
    }

    function rowOf(text: string) {
      return screen
        .getAllByTestId('grant-row')
        .find((r) => r.textContent?.includes(text)) as HTMLElement;
    }

    it('権利が無いときは空表示で、grantChanges を送らない', async () => {
      mockLoad({ ...baseUser, roleGrants: undefined });
      await renderForm();
      expect(screen.getByText('課金の権利はありません')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => expect(mockPush).toHaveBeenCalled());
      expect(lastBody()).toEqual({ roles: [] });
    });

    it('出どころ・状態・メモを表示し、操作は手動かつ取り消し前のものだけに出す', async () => {
      mockLoad();
      await renderForm();
      expect(screen.getAllByTestId('grant-row')).toHaveLength(4);
      expect(within(rowOf('支援')).getByText('手動')).toBeInTheDocument();
      expect(within(rowOf('支援')).getByText('有効')).toBeInTheDocument();
      expect(within(rowOf('支援')).getByText('2099-12-31')).toBeInTheDocument();
      expect(within(rowOf('Stripe')).queryByRole('button')).not.toBeInTheDocument();
      expect(
        within(screen.getAllByTestId('grant-row')[2]).queryByRole('button')
      ).not.toBeInTheDocument();
      expect(
        within(rowOf('期限切れ')).getByRole('button', { name: '期限の変更' })
      ).toBeInTheDocument();
    });

    it('取り消しは保存前の変更として表示し、元に戻せる', async () => {
      mockLoad();
      await renderForm();
      fireEvent.click(within(rowOf('支援')).getByRole('button', { name: '取り消し' }));
      expect(within(rowOf('支援')).getByText('取り消し予定')).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      fireEvent.click(within(rowOf('支援')).getByRole('button', { name: '元に戻す' }));
      expect(screen.queryByText('取り消し予定')).not.toBeInTheDocument();
    });

    it('取り消しを保存で送る', async () => {
      mockLoad();
      await renderForm();
      fireEvent.click(within(rowOf('支援')).getByRole('button', { name: '取り消し' }));
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard/users'));
      expect(lastBody()).toEqual({ roles: [], grantChanges: { revoke: ['m1'] } });
    });

    it('期限切れの権利の期限を変更して保存できる', async () => {
      mockLoad();
      await renderForm();
      fireEvent.click(within(rowOf('期限切れ')).getByRole('button', { name: '期限の変更' }));
      fireEvent.change(screen.getByLabelText('新しい期限'), { target: { value: '2099-06-30' } });
      fireEvent.click(screen.getByRole('button', { name: '決定' }));
      expect(screen.getByText('期限変更予定')).toBeInTheDocument();
      expect(screen.getByText('2099-06-30')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => expect(mockPush).toHaveBeenCalled());
      expect(lastBody()).toEqual({
        roles: [],
        grantChanges: {
          extend: [{ grantId: 'e1', expiresAt: Date.UTC(2099, 5, 30, 14, 59, 59, 999) }],
        },
      });
    });

    it('期限の変更で過去の日付はエラーにし、やめると閉じる', async () => {
      mockLoad();
      await renderForm();
      fireEvent.click(within(rowOf('支援')).getByRole('button', { name: '期限の変更' }));
      fireEvent.change(screen.getByLabelText('新しい期限'), { target: { value: '2000-01-01' } });
      fireEvent.click(screen.getByRole('button', { name: '決定' }));
      expect(screen.getByText('有効期限は今日以降の日付を指定してください')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
      expect(screen.queryByLabelText('新しい期限')).not.toBeInTheDocument();
    });

    it('追加の選択肢は有料ロールだけである', async () => {
      mockLoad();
      await renderForm();
      const options = within(screen.getByLabelText('ロール')).getAllByRole('option');
      expect(options.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== '')).toEqual([
        'livetalk-standard',
        'quick-clip-standard',
        'quick-clip-pro',
      ]);
    });

    it('quick-clip-unlimited は手動ロールの選択肢に出るが、権利の選択肢には出ない', async () => {
      mockLoad();
      await renderForm();
      expect(screen.getByText('Quick Clip 使い放題')).toBeInTheDocument();
      const options = within(screen.getByLabelText('ロール')).getAllByRole('option');
      expect(options.map((o) => (o as HTMLOptionElement).value)).not.toContain(
        'quick-clip-unlimited'
      );
    });

    it('権利を追加して保存できる (メモ付き)', async () => {
      mockLoad();
      await renderForm();
      fireEvent.change(screen.getByLabelText('ロール'), { target: { value: 'livetalk-standard' } });
      fireEvent.change(screen.getByLabelText(/^有効期限/), { target: { value: '2099-01-01' } });
      fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '寄付' } });
      fireEvent.click(screen.getByRole('button', { name: '追加' }));
      expect(screen.getByText('追加予定')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => expect(mockPush).toHaveBeenCalled());
      expect(lastBody().grantChanges).toEqual({
        add: [
          {
            roleId: 'livetalk-standard',
            expiresAt: Date.UTC(2099, 0, 1, 14, 59, 59, 999),
            sourceRef: '寄付',
          },
        ],
      });
    });

    it('追加の入力が不足していればエラーを出し、追加予定は取りやめられる', async () => {
      mockLoad();
      await renderForm();
      fireEvent.click(screen.getByRole('button', { name: '追加' }));
      expect(screen.getByText('ロールを選択してください')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('ロール'), { target: { value: 'livetalk-standard' } });
      fireEvent.change(screen.getByLabelText(/^有効期限/), { target: { value: '2099-01-01' } });
      fireEvent.click(screen.getByRole('button', { name: '追加' }));
      expect(screen.queryByText('ロールを選択してください')).not.toBeInTheDocument();
      fireEvent.click(within(rowOf('追加予定')).getByRole('button', { name: '元に戻す' }));
      expect(screen.queryByText('追加予定')).not.toBeInTheDocument();
    });

    it('メモ欄で Enter を押しても保存は送られない', async () => {
      mockLoad();
      await renderForm();
      fireEvent.keyDown(screen.getByLabelText('メモ'), { key: 'Enter' });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('API の権利の検証エラーを表示する', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => baseUser })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: '他の更新と競合しました。再読み込みしてください' }),
        });
      await renderForm();
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() =>
        expect(
          screen.getByText('他の更新と競合しました。再読み込みしてください')
        ).toBeInTheDocument()
      );
    });
  });

  describe('Stripe の顧客との対応', () => {
    const linkedUser = {
      userId: 'user-123',
      name: 'テストユーザー',
      email: 'test@example.com',
      roles: [],
      stripeCustomerId: 'cus_abc',
    };

    it('対応が無ければ欄を出さない', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ ...linkedUser, stripeCustomerId: undefined }),
      });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => expect(screen.getByText('テストユーザー')).toBeInTheDocument());
      expect(screen.queryByText(/Stripe の顧客:/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '顧客との対応を外す' })).not.toBeInTheDocument();
    });

    it('確認のうえ対応を外すと、欄が消える', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => linkedUser })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ...linkedUser, stripeCustomerId: undefined }),
        });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => expect(screen.getByText('cus_abc')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: '顧客との対応を外す' }));
      expect(screen.getByText(/Stripe 上の契約は解約されません/)).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: '対応を外す' }));

      await waitFor(() => expect(screen.queryByText('cus_abc')).not.toBeInTheDocument());
      expect(global.fetch).toHaveBeenLastCalledWith('/api/users/user-123/stripe-customer', {
        method: 'DELETE',
      });
    });

    it('確認をやめれば API を呼ばない', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => linkedUser });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => expect(screen.getByText('cus_abc')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: '顧客との対応を外す' }));
      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(screen.getByText('cus_abc')).toBeInTheDocument();
    });

    it('失敗したらエラーを表示し、対応は残る', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => linkedUser })
        .mockResolvedValueOnce({ ok: false, json: async () => ({ error: '競合しました' }) });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => expect(screen.getByText('cus_abc')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: '顧客との対応を外す' }));
      fireEvent.click(screen.getByRole('button', { name: '対応を外す' }));

      await waitFor(() => expect(screen.getByText('競合しました')).toBeInTheDocument());
      expect(screen.getByText('cus_abc')).toBeInTheDocument();
    });

    it('応答の形式が不正なら不正なレスポンス形式を表示する', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => linkedUser })
        .mockResolvedValueOnce({ ok: true, json: async () => null });

      render(<UserEditForm userId="user-123" />);

      await waitFor(() => expect(screen.getByText('cus_abc')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: '顧客との対応を外す' }));
      fireEvent.click(screen.getByRole('button', { name: '対応を外す' }));

      await waitFor(() => expect(screen.getByText('不正なレスポンス形式です')).toBeInTheDocument());
    });
  });
});
