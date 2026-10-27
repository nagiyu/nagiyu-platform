import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InvitationsPage from '@/app/invitations/page';
import { INVITATIONS_CHANGED_EVENT } from '@/lib/invitation-events';

const mockFetch = jest.fn((input: string | URL | Request, init?: RequestInit) => {
  const url = input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/invitations' && method === 'GET') {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        data: {
          invitations: [
            {
              groupId: 'group-1',
              groupName: '週末の買い出し',
              inviterName: '田中さん',
              createdAt: Date.UTC(2026, 1, 20, 10, 30),
            },
            {
              groupId: 'group-2',
              groupName: '旅行準備リスト',
              inviterName: '佐藤さん',
              createdAt: Date.UTC(2026, 1, 20, 23, 15),
            },
          ],
        },
      }),
    } as Response);
  }
  if (url.startsWith('/api/invitations/') && method === 'PUT') {
    return Promise.resolve({ ok: true, json: async () => ({ data: {} }) } as Response);
  }
  return Promise.resolve({ ok: false, status: 404 } as Response);
});

describe('InvitationsPage', () => {
  beforeEach(() => {
    global.fetch = mockFetch as jest.Mock;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('招待カードと承認/拒否ボタンをAPI取得結果で表示する', async () => {
    render(<InvitationsPage />);

    expect(screen.getByRole('heading', { level: 1, name: '招待一覧' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('週末の買い出し')).toBeInTheDocument();
    });
    expect(screen.getByText('週末の買い出し')).toBeInTheDocument();
    expect(screen.getByText('旅行準備リスト')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '承認' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '拒否' })).toHaveLength(2);
  });

  it('招待日時を JST の年/月/日 時:分で表示する', async () => {
    render(<InvitationsPage />);

    expect(await screen.findByText('招待日時: 2026/02/20 19:30')).toBeInTheDocument();
    // UTC では 2/20 のうちでも、JST では翌日になる
    expect(screen.getByText('招待日時: 2026/02/21 08:15')).toBeInTheDocument();
  });

  it('承認ボタンをクリックすると招待が削除される', async () => {
    render(<InvitationsPage />);

    await screen.findByText('週末の買い出し');
    fireEvent.click(screen.getAllByRole('button', { name: '承認' })[0]);

    await waitFor(() => {
      expect(screen.queryByText('週末の買い出し')).not.toBeInTheDocument();
    });
    expect(screen.getByText('旅行準備リスト')).toBeInTheDocument();
  });

  it('承認が人数上限で失敗した場合は上限の文言を表示し、招待は残る', async () => {
    render(<InvitationsPage />);
    await screen.findByText('週末の買い出し');

    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'MEMBER_LIMIT_EXCEEDED',
          message: 'グループメンバーは最大5名です',
        }),
      } as Response)
    );
    fireEvent.click(screen.getAllByRole('button', { name: '承認' })[0]);

    expect(await screen.findByText('グループメンバーは最大5名です')).toBeInTheDocument();
    expect(screen.getByText('週末の買い出し')).toBeInTheDocument();
  });

  it('承認がそれ以外の理由で失敗した場合は既定の文言を表示する', async () => {
    render(<InvitationsPage />);
    await screen.findByText('週末の買い出し');

    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ error: 'INTERNAL_SERVER_ERROR', message: 'x' }),
      } as Response)
    );
    fireEvent.click(screen.getAllByRole('button', { name: '承認' })[0]);

    expect(await screen.findByText('招待の承認に失敗しました。')).toBeInTheDocument();
    expect(screen.getByText('週末の買い出し')).toBeInTheDocument();
  });

  it('拒否ボタンをクリックすると確認ダイアログを表示する', async () => {
    render(<InvitationsPage />);

    await screen.findByText('週末の買い出し');
    fireEvent.click(screen.getAllByRole('button', { name: '拒否' })[0]);

    expect(screen.getByText('招待を拒否')).toBeInTheDocument();
  });

  it('拒否を確認すると招待が削除される', async () => {
    render(<InvitationsPage />);

    await screen.findByText('週末の買い出し');
    fireEvent.click(screen.getAllByRole('button', { name: '拒否' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '拒否' }));

    await waitFor(() => {
      expect(screen.queryByText('週末の買い出し')).not.toBeInTheDocument();
    });
    expect(screen.getByText('旅行準備リスト')).toBeInTheDocument();
  });

  it('すべての招待を処理すると空メッセージを表示する', async () => {
    render(<InvitationsPage />);

    await screen.findByText('週末の買い出し');
    fireEvent.click(screen.getAllByRole('button', { name: '承認' })[0]);
    await waitFor(() => {
      expect(screen.queryByText('週末の買い出し')).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole('button', { name: '承認' })[0]);

    await waitFor(() => {
      expect(screen.getByText('招待はありません。')).toBeInTheDocument();
    });
  });

  describe('処理中の制御', () => {
    /** PUT の応答を任意のタイミングで返せるようにする */
    function holdNextPut() {
      let resolvePut: (response: Response) => void = () => {};
      mockFetch.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolvePut = resolve;
          })
      );
      return {
        resolve: (response: Response) => resolvePut(response),
      };
    }

    it('承認の処理中はそのカードの承認・拒否を無効にし、他のカードは操作できる', async () => {
      render(<InvitationsPage />);
      await screen.findByText('週末の買い出し');

      const pending = holdNextPut();
      fireEvent.click(screen.getAllByRole('button', { name: '承認' })[0]);

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: '承認' })[0]).toBeDisabled();
      });
      expect(screen.getAllByRole('button', { name: '拒否' })[0]).toBeDisabled();
      expect(screen.getAllByRole('button', { name: '承認' })[1]).toBeEnabled();
      expect(screen.getAllByRole('button', { name: '拒否' })[1]).toBeEnabled();

      const putCalls = () =>
        mockFetch.mock.calls.filter(
          ([, init]) => (init as RequestInit | undefined)?.method === 'PUT'
        );
      fireEvent.click(screen.getAllByRole('button', { name: '承認' })[0]);
      expect(putCalls()).toHaveLength(1);

      pending.resolve({ ok: true, json: async () => ({ data: {} }) } as Response);
      await waitFor(() => {
        expect(screen.queryByText('週末の買い出し')).not.toBeInTheDocument();
      });
    });

    it('承認が失敗したらボタンの無効化を解除する', async () => {
      render(<InvitationsPage />);
      await screen.findByText('週末の買い出し');

      const pending = holdNextPut();
      fireEvent.click(screen.getAllByRole('button', { name: '承認' })[0]);
      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: '承認' })[0]).toBeDisabled();
      });

      pending.resolve({
        ok: false,
        status: 500,
        json: async () => ({ error: 'INTERNAL_SERVER_ERROR', message: 'x' }),
      } as Response);

      expect(await screen.findByText('招待の承認に失敗しました。')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: '承認' })[0]).toBeEnabled();
      expect(screen.getAllByRole('button', { name: '拒否' })[0]).toBeEnabled();
    });

    it('拒否の確定後はそのカードの承認・拒否を無効にし、終わったら解除する', async () => {
      render(<InvitationsPage />);
      await screen.findByText('週末の買い出し');

      fireEvent.click(screen.getAllByRole('button', { name: '拒否' })[0]);
      // 確認ダイアログを出しただけでは処理中にしない (ダイアログ表示中は背面が aria-hidden になる)
      expect(screen.getAllByRole('button', { name: '承認', hidden: true })[0]).toBeEnabled();

      const pending = holdNextPut();
      fireEvent.click(screen.getByRole('button', { name: '拒否' }));
      // 処理中は確認ダイアログが開いたままで、背面が aria-hidden になる
      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: '承認', hidden: true })[0]).toBeDisabled();
      });

      pending.resolve({ ok: false, status: 500 } as Response);

      expect(await screen.findByText('招待の拒否に失敗しました。')).toBeInTheDocument();
      // ダイアログの終了アニメーション中は背面が aria-hidden のまま残る
      expect(screen.getAllByRole('button', { name: '承認', hidden: true })[0]).toBeEnabled();
    });
  });

  describe('ヘッダーのバッジへの通知', () => {
    it('承認に成功すると招待数の変更を通知する', async () => {
      const listener = jest.fn();
      window.addEventListener(INVITATIONS_CHANGED_EVENT, listener);
      try {
        render(<InvitationsPage />);
        await screen.findByText('週末の買い出し');
        fireEvent.click(screen.getAllByRole('button', { name: '承認' })[0]);

        await waitFor(() => {
          expect(listener).toHaveBeenCalledTimes(1);
        });
      } finally {
        window.removeEventListener(INVITATIONS_CHANGED_EVENT, listener);
      }
    });

    it('拒否に成功すると招待数の変更を通知する', async () => {
      const listener = jest.fn();
      window.addEventListener(INVITATIONS_CHANGED_EVENT, listener);
      try {
        render(<InvitationsPage />);
        await screen.findByText('週末の買い出し');
        fireEvent.click(screen.getAllByRole('button', { name: '拒否' })[0]);
        fireEvent.click(screen.getByRole('button', { name: '拒否' }));

        await waitFor(() => {
          expect(listener).toHaveBeenCalledTimes(1);
        });
      } finally {
        window.removeEventListener(INVITATIONS_CHANGED_EVENT, listener);
      }
    });

    it('承認に失敗したときは通知しない', async () => {
      const listener = jest.fn();
      window.addEventListener(INVITATIONS_CHANGED_EVENT, listener);
      try {
        render(<InvitationsPage />);
        await screen.findByText('週末の買い出し');
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as Response)
        );
        fireEvent.click(screen.getAllByRole('button', { name: '承認' })[0]);

        await screen.findByText('招待の承認に失敗しました。');
        expect(listener).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener(INVITATIONS_CHANGED_EVENT, listener);
      }
    });
  });
});
