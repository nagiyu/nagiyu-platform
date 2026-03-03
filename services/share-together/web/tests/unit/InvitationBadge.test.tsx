import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { InvitationBadge } from '@/components/InvitationBadge';

describe('InvitationBadge', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            invitations: [{ groupId: 'group-1' }, { groupId: 'group-2' }],
          },
        }),
      } as Response)
    ) as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('APIで取得した未処理招待数をバッジに表示する', async () => {
    render(<InvitationBadge />);

    const invitationLink = screen.getByRole('link', { name: /招待/ });

    expect(invitationLink).toHaveAttribute('href', '/invitations');
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/invitations');
  });

  it('API取得に失敗した場合はエラーログを出力する', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)) as jest.Mock;

    render(<InvitationBadge />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('招待バッジの取得に失敗しました', expect.any(Object));
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('API通信自体が失敗した場合はエラーログを出力する', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('network error'))) as jest.Mock;

    render(<InvitationBadge />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('招待バッジの取得に失敗しました', expect.any(Object));
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
