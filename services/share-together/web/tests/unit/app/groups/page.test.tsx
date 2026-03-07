import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import GroupsPage from '@/app/groups/page';

describe('GroupsPage', () => {
  beforeEach(() => {
    global.fetch = jest.fn((input: string | URL | Request) => {
      const url = input.toString();
      if (url === '/api/groups') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              groups: [
                { groupId: 'group-1', name: '家族', ownerUserId: 'user-1', isOwner: true },
                { groupId: 'group-2', name: 'ルームメイト', ownerUserId: 'user-2', isOwner: false },
              ],
            },
          }),
        } as Response);
      }
      if (url === '/api/groups/group-1/members') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { members: [{ userId: 'user-1' }, { userId: 'user-2' }] } }),
        } as Response);
      }
      if (url === '/api/groups/group-2/members') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { members: [{ userId: 'user-2', name: 'ルームメイトユーザー' }] } }),
        } as Response);
      }
      if (url === '/api/groups/group-1/lists') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { lists: [{ listId: 'list-1', name: '共有リストA' }] } }),
        } as Response);
      }
      if (url === '/api/groups/group-2/lists') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { lists: [] } }),
        } as Response);
      }
      if (url === '/api/auth/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ user: { id: 'user-1' } }),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('APIから取得したグループ一覧とグループ作成ボタンを表示する', async () => {
    render(<GroupsPage />);

    expect(screen.getByRole('heading', { name: 'グループ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'グループを作成' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: '家族' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'ルームメイト' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /家族/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ルームメイト/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'メンバー一覧' })).toBeInTheDocument();
    });
  });
});
