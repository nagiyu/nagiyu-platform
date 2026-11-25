import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
          json: async () => ({
            data: {
              members: [{ userId: 'user-1' }, { userId: 'user-2' }],
              pendingInvitationCount: 0,
            },
          }),
        } as Response);
      }
      if (url === '/api/groups/group-2/members') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              members: [{ userId: 'user-2', name: 'ルームメイトユーザー' }],
              pendingInvitationCount: 0,
            },
          }),
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
    // 選択中の「家族」は、一覧のカードと詳細の見出しの 2 か所に出る。
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 2, name: '家族' })).toHaveLength(2);
      expect(screen.getAllByRole('heading', { level: 2, name: 'ルームメイト' })).toHaveLength(1);
    });
    expect(screen.getByRole('button', { name: /家族/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ルームメイト/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'メンバー一覧' })).toBeInTheDocument();
    });
  });

  it('選択中のグループのカードを強調し、詳細にそのグループ名を見出しで出す', async () => {
    render(<GroupsPage />);

    const familyCard = await screen.findByRole('button', { name: /家族/ });
    expect(familyCard).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /ルームメイト/ })).not.toHaveAttribute(
      'aria-current'
    );
    await screen.findByRole('heading', { name: 'メンバー一覧' });
    expect(screen.queryByText(/group-1/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ルームメイト/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ルームメイト/ })).toHaveAttribute(
        'aria-current',
        'true'
      );
    });
    expect(screen.getByRole('button', { name: /家族/ })).not.toHaveAttribute('aria-current');
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 2, name: 'ルームメイト' })).toHaveLength(2);
    });
    expect(screen.getAllByRole('heading', { level: 2, name: '家族' })).toHaveLength(1);
  });

  it('メンバー一覧 API の招待中の人数を招待フォームの上限判定に使う', async () => {
    const original = global.fetch as jest.Mock;
    global.fetch = jest.fn((input: string | URL | Request) => {
      if (input.toString() === '/api/groups/group-1/members') {
        // 読み込み中の表示を挟ませ、取得結果で詳細が作り直されるようにする
        return new Promise<Response>((resolve) => setTimeout(resolve, 20)).then(
          () =>
            ({
              ok: true,
              json: async () => ({
                data: {
                  members: [
                    { userId: 'user-1', name: 'a' },
                    { userId: 'user-2', name: 'b' },
                  ],
                  pendingInvitationCount: 3,
                },
              }),
            }) as Response
        );
      }
      return original(input);
    }) as jest.Mock;

    render(<GroupsPage />);

    expect(await screen.findByText('グループメンバーは最大5名です')).toBeInTheDocument();
  });

  describe('グループが 0 件のとき', () => {
    const EMPTY_MESSAGE = 'グループはまだありません。「グループを作成」から追加できます。';

    it('取得が終わったあとに案内を出し、読み込み中は出さない', async () => {
      let resolveGroups: ((value: Response) => void) | undefined;
      global.fetch = jest.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveGroups = resolve;
          })
      ) as jest.Mock;

      render(<GroupsPage />);

      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
      expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();

      resolveGroups?.({
        ok: true,
        json: async () => ({ data: { groups: [], currentUserId: 'user-1' } }),
      } as Response);

      expect(await screen.findByText(EMPTY_MESSAGE)).toBeInTheDocument();
    });

    it('取得に失敗したときは出さない', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      global.fetch = jest.fn(async () => ({ ok: false, status: 500 }) as Response) as jest.Mock;

      render(<GroupsPage />);

      expect(await screen.findByText('グループ一覧の取得に失敗しました。')).toBeInTheDocument();
      expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
      consoleErrorSpy.mockRestore();
    });
  });
});
