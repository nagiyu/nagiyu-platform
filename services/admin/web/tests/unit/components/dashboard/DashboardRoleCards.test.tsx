import { render, screen } from '@testing-library/react';
import DashboardRoleCards from '@/components/dashboard/DashboardRoleCards';

// NotifyButton は push 購読の副作用を持つため、ロール分岐の検証に関心を絞るためスタブ化する
jest.mock('@/components/notify/NotifyButton', () => ({
  __esModule: true,
  default: () => <div>NotifyButtonMock</div>,
}));

/**
 * props が boolean（canManageNotifications / canReadErrors）になったことで、
 * 実在ロールの権限の組み合わせに縛られず 4 通りすべてを直接指定して網羅できる。
 * これにより、通知設定カード・エラー履歴カードの 2 条件がそれぞれ独立して
 * 評価されていることを実証する。
 */
describe('DashboardRoleCards', () => {
  it('canManageNotifications: true, canReadErrors: true の場合、両カードが描画される', () => {
    render(<DashboardRoleCards canManageNotifications={true} canReadErrors={true} />);

    expect(screen.getByRole('heading', { name: '通知設定' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'エラー履歴' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'エラー履歴を表示' })).toHaveAttribute(
      'href',
      '/errors'
    );
  });

  it('canManageNotifications: true, canReadErrors: false の場合、通知設定カードのみ描画される', () => {
    render(<DashboardRoleCards canManageNotifications={true} canReadErrors={false} />);

    expect(screen.getByRole('heading', { name: '通知設定' })).toBeInTheDocument();
    expect(screen.getByText('NotifyButtonMock')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'エラー履歴' })).not.toBeInTheDocument();
  });

  it('canManageNotifications: false, canReadErrors: true の場合、エラー履歴カードのみ描画される', () => {
    render(<DashboardRoleCards canManageNotifications={false} canReadErrors={true} />);

    expect(screen.queryByRole('heading', { name: '通知設定' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'エラー履歴' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'エラー履歴を表示' })).toHaveAttribute(
      'href',
      '/errors'
    );
  });

  it('canManageNotifications: false, canReadErrors: false の場合、どちらも描画されない', () => {
    render(<DashboardRoleCards canManageNotifications={false} canReadErrors={false} />);

    expect(screen.queryByRole('heading', { name: '通知設定' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'エラー履歴' })).not.toBeInTheDocument();
  });
});
