import { render, screen } from '@testing-library/react';
import DashboardRoleCards from '@/components/dashboard/DashboardRoleCards';

// NotifyButton は push 購読の副作用を持つため、ロール分岐の検証に関心を絞るためスタブ化する
jest.mock('@/components/notify/NotifyButton', () => ({
  __esModule: true,
  default: () => <div>NotifyButtonMock</div>,
}));

/**
 * libs/common/src/auth/roles.ts を確認したところ、notifications:write / errors:read の
 * いずれか一方のみを持つロールは実在しない（両方持つのは admin のみで、他のロールは
 * どちらも持たない）。そのため「片方のみ表示される」ケースは実在ロールの組み合わせで
 * 表現できず、捏造もしない。代わりに admin（両権限あり）と stock-viewer（両権限なし）を
 * 比較することで、通知設定カード・エラー履歴カードの 2 条件がそれぞれ独立して
 * hasPermission で評価されていることを確認する。
 */
describe('DashboardRoleCards', () => {
  it('admin ロールでは通知設定カードとエラー履歴カードが両方描画される', () => {
    render(<DashboardRoleCards roles={['admin']} />);

    expect(screen.getByRole('heading', { name: '通知設定' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'エラー履歴' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'エラー履歴を表示' })).toHaveAttribute(
      'href',
      '/errors'
    );
  });

  it('roles が空配列の場合はどちらのカードも描画されない', () => {
    render(<DashboardRoleCards roles={[]} />);

    expect(screen.queryByRole('heading', { name: '通知設定' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'エラー履歴' })).not.toBeInTheDocument();
  });

  it('通知設定・エラー履歴いずれの権限も持たない実在ロール（stock-viewer）ではどちらのカードも描画されない', () => {
    render(<DashboardRoleCards roles={['stock-viewer']} />);

    expect(screen.queryByRole('heading', { name: '通知設定' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'エラー履歴' })).not.toBeInTheDocument();
  });
});
