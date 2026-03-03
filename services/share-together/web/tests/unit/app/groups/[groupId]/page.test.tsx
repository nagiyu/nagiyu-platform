import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import GroupDetailPage from '@/app/groups/[groupId]/page';

const mockUseParams = jest.fn<{ groupId: string }, []>();

jest.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
}));

describe('GroupDetailPage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('オーナーのグループではメンバー一覧・削除ボタン・グループ削除ボタンを表示する', async () => {
    mockUseParams.mockReturnValue({ groupId: 'group-owner' });
    global.fetch = jest.fn((input: string | URL | Request) => {
      const url = input.toString();
      if (url === '/api/groups') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              groups: [{ groupId: 'group-owner', ownerUserId: 'user-owner', isOwner: true }],
            },
          }),
        } as Response);
      }
      if (url === '/api/groups/group-owner/members') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              members: [
                { userId: 'user-owner', name: 'なぎゆ' },
                { userId: 'user-member-1', name: 'さくら' },
                { userId: 'user-member-2', name: 'たろう' },
              ],
            },
          }),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    }) as jest.Mock;

    render(<GroupDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('グループID: group-owner')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'グループ詳細' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'メンバー一覧' })).toBeInTheDocument();
    expect(screen.getByText('なぎゆ')).toBeInTheDocument();
    expect(screen.getByText('さくら')).toBeInTheDocument();
    expect(screen.getByText('たろう')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'メンバー招待フォーム' })).toBeInTheDocument();
    expect(screen.getByText('オーナーとしてメンバーを招待できます。')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '招待を送信' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '招待を送信' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'さくらを削除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'たろうを削除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'グループを削除' })).toBeInTheDocument();
  });

  it('非オーナーのグループではメンバー招待フォームを無効化し脱退ボタンを表示する', async () => {
    mockUseParams.mockReturnValue({ groupId: 'group-member' });
    global.fetch = jest.fn((input: string | URL | Request) => {
      const url = input.toString();
      if (url === '/api/groups') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              groups: [{ groupId: 'group-member', ownerUserId: 'user-owner', isOwner: false }],
            },
          }),
        } as Response);
      }
      if (url === '/api/groups/group-member/members') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              members: [
                { userId: 'user-owner', name: 'なぎゆ' },
                { userId: 'user-member-1', name: 'さくら' },
              ],
            },
          }),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    }) as jest.Mock;

    render(<GroupDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('グループID: group-member')).toBeInTheDocument();
    });
    expect(
      screen.getByText('このグループではメンバー追加はできません（オーナーのみ）。')
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '招待を送信' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'さくらを削除' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'グループを脱退' })).toBeInTheDocument();
  });
});
