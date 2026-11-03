import { render, screen } from '@testing-library/react';
import PlansPage from '../../../../src/app/plans/page';
import { getSession } from '../../../../src/lib/auth/session';
import { loadPlansPageData, syncUserForPlans } from '../../../../src/lib/plans-data';

const mockGetBillingConfig = jest.fn();
const mockRedirect = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

jest.mock('@nagiyu/auth-core', () => ({
  getBillingConfig: () => mockGetBillingConfig(),
  createBillingStripe: jest.fn(() => ({})),
  createUserRepository: jest.fn(() => ({})),
}));
jest.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'auth.nagiyu.com' }),
}));
jest.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));
jest.mock('../../../../src/lib/auth/session', () => ({ getSession: jest.fn() }));
jest.mock('../../../../src/lib/plans-data', () => ({
  loadPlansPageData: jest.fn(),
  syncUserForPlans: jest.fn(),
}));
jest.mock('../../../../src/app/plans/plan-actions', () => ({
  PlanActionButton: ({ label }: { label: string }) => <button>{label}</button>,
}));

const baseCard = {
  roleId: 'livetalk-premium',
  name: 'LiveTalk プレミアム',
  description: '説明',
  priceLabel: '月額 ¥500 (税込)',
  state: 'none' as const,
  stateLabel: null,
  manualLabel: null,
  canSubscribe: true,
};

function render_(
  searchParams: { checkout?: string | string[]; callbackUrl?: string | string[] } = {}
) {
  return PlansPage({ searchParams: Promise.resolve(searchParams) });
}

describe('PlansPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_URL = 'https://auth.nagiyu.com';
    mockGetBillingConfig.mockReturnValue({ secretKey: 'sk', webhookSecret: 'wh' });
    (getSession as jest.Mock).mockResolvedValue({ user: { id: 'u1', roles: [] } });
  });

  it('課金が無効なら準備中と表示し、価格と操作を出さない', async () => {
    mockGetBillingConfig.mockReturnValue(null);

    render(await render_());

    expect(screen.getByText('準備中です')).toBeInTheDocument();
    expect(screen.queryByText('申し込む')).not.toBeInTheDocument();
    expect(loadPlansPageData).not.toHaveBeenCalled();
  });

  it('説明があれば出し、無ければ要素ごと出さない', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: false,
      cards: [
        baseCard,
        {
          ...baseCard,
          roleId: 'quick-clip-premium',
          name: 'QuickClip プレミアム',
          description: null,
        },
      ],
    });

    render(await render_());

    expect(screen.getAllByText('説明')).toHaveLength(1);
  });

  it('未ログインはログインへの導線を出し、契約の管理は出さない', async () => {
    (getSession as jest.Mock).mockResolvedValue(null);
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: false,
      cards: [{ ...baseCard, state: 'guest', canSubscribe: false }],
    });

    render(await render_({ callbackUrl: 'https://quick-clip.nagiyu.com/a' }));

    const link = screen.getByRole('link', { name: 'ログインして申し込む' });
    expect(link.getAttribute('href')).toContain('/signin?callbackUrl=');
    expect(screen.getByText('月額 ¥500 (税込)')).toBeInTheDocument();
    expect(screen.queryByText('契約を管理')).not.toBeInTheDocument();
    expect(loadPlansPageData).toHaveBeenCalledWith(expect.anything(), null);
  });

  it('契約中は次の更新日と契約の管理を出し、注記を載せる', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: true,
      cards: [
        {
          ...baseCard,
          state: 'subscribed',
          stateLabel: '次の更新日: 2026年12月3日',
          canSubscribe: false,
        },
      ],
    });

    render(await render_());

    expect(screen.getByText('契約中')).toBeInTheDocument();
    expect(screen.getByText('次の更新日: 2026年12月3日')).toBeInTheDocument();
    expect(screen.getByText('契約を管理')).toBeInTheDocument();
    expect(screen.queryByText('申し込む')).not.toBeInTheDocument();
    expect(screen.getByText(/契約は自動で更新されます/)).toBeInTheDocument();
  });

  it('未契約は申し込みを、価格が取れないときは価格の代わりに案内を出す', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: false,
      cards: [
        baseCard,
        { ...baseCard, roleId: 'quick-clip-premium', priceLabel: null, canSubscribe: false },
      ],
    });

    render(await render_());

    expect(screen.getAllByText('申し込む')).toHaveLength(1);
    expect(screen.getByText('価格を取得できませんでした')).toBeInTheDocument();
  });

  it('解約予約中と手動の権利の表示を出す', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: true,
      cards: [
        {
          ...baseCard,
          state: 'canceling',
          stateLabel: '2026年11月20日に終了します',
          manualLabel: '運営による付与があります (期限なし)',
          canSubscribe: false,
        },
      ],
    });

    render(await render_());

    expect(screen.getByText('解約予約中')).toBeInTheDocument();
    expect(screen.getByText('2026年11月20日に終了します')).toBeInTheDocument();
    expect(screen.getByText('運営による付与があります (期限なし)')).toBeInTheDocument();
  });

  it('決済成功なら同期してから /refresh へ送る。戻り先が無ければプランの画面に戻す', async () => {
    (syncUserForPlans as jest.Mock).mockResolvedValue({ user: null, subscriptions: null });

    await expect(render_({ checkout: 'success' })).rejects.toThrow('NEXT_REDIRECT');

    expect(syncUserForPlans).toHaveBeenCalledWith(expect.anything(), 'u1');
    expect(mockRedirect).toHaveBeenCalledWith(
      `/refresh?callbackUrl=${encodeURIComponent('https://auth.nagiyu.com/plans')}`
    );
  });

  it('決済成功の戻り先に、許可された URL だけを引き継ぐ', async () => {
    (syncUserForPlans as jest.Mock).mockResolvedValue({ user: null, subscriptions: null });

    await expect(
      render_({ checkout: 'success', callbackUrl: 'https://evil.example.com/' })
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledWith(
      `/refresh?callbackUrl=${encodeURIComponent('https://auth.nagiyu.com/plans')}`
    );
  });

  it('同じキーを重ねた callbackUrl は無いものとして扱い、画面を落とさない', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: false,
      cards: [baseCard],
    });

    render(await render_({ callbackUrl: ['https://quick-clip.nagiyu.com/a', '/b'] }));

    expect(screen.getByText('申し込む')).toBeInTheDocument();
  });

  it('同じキーを重ねた checkout は success として扱わない', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: false,
      cards: [baseCard],
    });

    render(await render_({ checkout: ['success', 'success'] }));

    expect(syncUserForPlans).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(loadPlansPageData).toHaveBeenCalled();
  });
});
