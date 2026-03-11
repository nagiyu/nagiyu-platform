import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InvitationsPage from '@/app/invitations/page';

jest.mock('@/components/Navigation', () => ({
  Navigation: () => <div>Navigation</div>,
}));

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
              createdAt: '2026-02-20 19:30',
            },
            {
              groupId: 'group-2',
              groupName: '旅行準備リスト',
              inviterName: '佐藤さん',
              createdAt: '2026-02-21 08:15',
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

    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '招待一覧' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('週末の買い出し')).toBeInTheDocument();
    });
    expect(screen.getByText('週末の買い出し')).toBeInTheDocument();
    expect(screen.getByText('旅行準備リスト')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '承認' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '拒否' })).toHaveLength(2);
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
});
