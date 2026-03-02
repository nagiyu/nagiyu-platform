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
                { groupId: 'group-1', name: '家族', ownerUserId: 'user-1' },
                { groupId: 'group-2', name: 'ルームメイト', ownerUserId: 'user-2' },
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
          json: async () => ({ data: { members: [{ userId: 'user-2' }] } }),
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

    expect(screen.getByRole('heading', { name: 'グループ一覧' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'グループを作成' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
    });
    expect(screen.getByRole('link', { name: /家族/ })).toHaveAttribute('href', '/groups/group-1');
    expect(screen.getByRole('link', { name: /ルームメイト/ })).toHaveAttribute(
      'href',
      '/groups/group-2'
    );
  });
});
