/**
 * Unit tests for DashboardPage
 */

import { render, screen } from '@testing-library/react';
import DashboardPage from '../../../../src/app/dashboard/page';
import { getSession } from '../../../../src/lib/auth/session';

jest.mock('../../../../src/lib/auth/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('自分のロールを ID ではなく名前で表示する', async () => {
    (getSession as jest.Mock).mockResolvedValue({
      user: {
        id: 'user-1',
        name: 'テストユーザー',
        email: 'user@example.com',
        roles: ['admin', 'stock-viewer'],
      },
    });

    render(await DashboardPage());

    expect(screen.getByText('管理者')).toBeInTheDocument();
    expect(screen.getByText('Stock 閲覧者')).toBeInTheDocument();
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
    expect(screen.queryByText('stock-viewer')).not.toBeInTheDocument();
  });

  it('ROLES に無い ID は ID のまま表示する', async () => {
    (getSession as jest.Mock).mockResolvedValue({
      user: {
        id: 'user-1',
        name: 'テストユーザー',
        email: 'user@example.com',
        roles: ['legacy-role'],
      },
    });

    render(await DashboardPage());

    expect(screen.getByText('legacy-role')).toBeInTheDocument();
  });

  it('ロールが無いときは「なし」を表示する', async () => {
    (getSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-1', name: 'テストユーザー', email: 'user@example.com', roles: [] },
    });

    render(await DashboardPage());

    expect(screen.getByText('なし')).toBeInTheDocument();
  });
});
