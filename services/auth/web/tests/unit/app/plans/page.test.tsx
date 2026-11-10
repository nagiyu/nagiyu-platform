import { render, screen } from '@testing-library/react';
import PlansPage from '../../../../src/app/plans/page';
import { getSession } from '../../../../src/lib/auth/session';
import { loadPlansPageData, syncUserForPlans } from '../../../../src/lib/plans-data';

const mockGetBillingConfig = jest.fn();
const mockRedirect = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

jest.mock('@nagiyu/auth-core', () => ({
  canStartCheckout: jest.requireActual('../../../../../core/src/billing/checkout-policy')
    .canStartCheckout,
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
  DowngradeButton: ({ label, confirmMessage }: { label: string; confirmMessage: string }) => (
    <button data-confirm={confirmMessage}>{label}</button>
  ),
  PlanActionButton: ({ label, endpoint }: { label: string; endpoint: string }) => (
    <button data-endpoint={endpoint}>{label}</button>
  ),
  ScheduledChangeCancelButton: ({ serviceId }: { serviceId: string }) => (
    <button data-service={serviceId}>予約を取り消す</button>
  ),
}));

const baseCard = {
  roleId: 'livetalk-standard',
  name: 'LiveTalk スタンダード',
  description: '説明',
  priceLabel: '月額 ¥500 (税込)',
  priceFetchFailed: false,
  state: 'none' as const,
  stateLabel: null,
  manualLabel: null,
  action: 'subscribe' as const,
  scheduledChangeLabel: null,
  downgradeConfirmMessage: null,
};

const baseService = {
  serviceId: 'quick-clip',
  name: 'Quick Clip',
  tiers: [baseCard],
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
    process.env.NAGIYU_ENV = 'prod';
    mockGetBillingConfig.mockReturnValue({ secretKey: 'sk', webhookSecret: 'wh' });
    (getSession as jest.Mock).mockResolvedValue({ user: { id: 'u1', roles: [] } });
  });

  it('課金が無効なら準備中と表示し、価格と操作を出さない', async () => {
    mockGetBillingConfig.mockReturnValue(null);

    render(await render_());

    expect(screen.getByText('準備中です')).toBeInTheDocument();
    expect(screen.queryByText('申し込む')).not.toBeInTheDocument();
    expect(loadPlansPageData).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '特定商取引法に基づく表記' })).toHaveAttribute(
      'href',
      '/legal/tokushoho'
    );
  });

  it('説明があれば出し、無ければ要素ごと出さない', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: false,
      services: [
        {
          ...baseService,
          tiers: [
            baseCard,
            {
              ...baseCard,
              roleId: 'quick-clip-standard',
              name: 'Quick Clip スタンダード',
              description: null,
            },
          ],
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
      services: [
        { ...baseService, tiers: [{ ...baseCard, state: 'guest', action: 'sign-in' as const }] },
      ],
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
      services: [
        {
          ...baseService,
          tiers: [
            {
              ...baseCard,
              state: 'subscribed',
              stateLabel: '次の更新日: 2026年12月3日',
              action: null,
            },
          ],
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
      services: [
        {
          ...baseService,
          tiers: [
            baseCard,
            {
              ...baseCard,
              roleId: 'quick-clip-standard',
              priceLabel: null,
              priceFetchFailed: true,
              action: null,
            },
          ],
        },
      ],
    });

    render(await render_());

    expect(screen.getAllByText('申し込む')).toHaveLength(1);
    expect(screen.getByText('価格を取得できませんでした')).toBeInTheDocument();
  });

  it('価格が無いだけの枠は価格の行を出さず、取得失敗の案内も出さない', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: true,
      services: [
        {
          ...baseService,
          tiers: [{ ...baseCard, priceLabel: null, priceFetchFailed: false, state: 'subscribed' }],
        },
      ],
    });

    render(await render_());

    expect(screen.getByRole('region', { name: 'LiveTalk スタンダード' })).toBeInTheDocument();
    expect(screen.queryByText('価格を取得できませんでした')).not.toBeInTheDocument();
  });

  it('出す枠が無ければ準備中を出し、顧客がいなければ契約の管理も注記も出さない', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: false,
      services: [],
    });

    render(await render_());

    expect(screen.getByText('準備中です')).toBeInTheDocument();
    expect(screen.queryByText('契約を管理')).not.toBeInTheDocument();
    expect(screen.queryByText(/契約は自動で更新されます/)).not.toBeInTheDocument();
  });

  it('出す枠が無くても顧客がいれば、準備中と契約の管理を出す', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: true,
      services: [],
    });

    render(await render_());

    expect(screen.getByText('準備中です')).toBeInTheDocument();
    expect(screen.getByText('契約を管理')).toBeInTheDocument();
  });

  it('解約予約中と手動の権利の表示を出す', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: true,
      services: [
        {
          ...baseService,
          tiers: [
            {
              ...baseCard,
              state: 'canceling',
              stateLabel: '2026年11月20日に終了します',
              manualLabel: '運営による付与があります (期限なし)',
              action: null,
            },
          ],
        },
      ],
    });

    render(await render_());

    expect(screen.getByText('解約予約中')).toBeInTheDocument();
    expect(screen.getByText('2026年11月20日に終了します')).toBeInTheDocument();
    expect(screen.getByText('運営による付与があります (期限なし)')).toBeInTheDocument();
  });

  it('サービスの見出しを出す', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: false,
      services: [baseService, { ...baseService, serviceId: 'livetalk', name: 'LiveTalk' }],
    });

    render(await render_());

    expect(screen.getByRole('heading', { level: 2, name: 'Quick Clip' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'LiveTalk' })).toBeInTheDocument();
  });

  it('上げは plan-change を呼ぶボタンで出す', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: true,
      services: [{ ...baseService, tiers: [{ ...baseCard, action: 'upgrade' as const }] }],
    });

    render(await render_());

    expect(screen.getByText('この段に変える')).toHaveAttribute(
      'data-endpoint',
      '/api/billing/plan-change'
    );
  });

  it('下げは確認の本文を持つボタンで出し、本文が無ければ出さない', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: true,
      services: [
        {
          ...baseService,
          tiers: [
            { ...baseCard, action: 'downgrade' as const, downgradeConfirmMessage: '確認の本文' },
            {
              ...baseCard,
              roleId: 'quick-clip-standard',
              action: 'downgrade' as const,
              downgradeConfirmMessage: null,
            },
          ],
        },
      ],
    });

    render(await render_());

    expect(screen.getAllByText('この段に変える')).toHaveLength(1);
    expect(screen.getByText('この段に変える')).toHaveAttribute('data-confirm', '確認の本文');
  });

  it('下げを予約中は行き先の文言と、サービスの予約の取り消しを出す', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: true,
      services: [
        {
          ...baseService,
          tiers: [
            {
              ...baseCard,
              state: 'subscribed' as const,
              action: null,
              scheduledChangeLabel: '2026年12月3日からQuick Clip スタンダードに変わります',
            },
          ],
        },
      ],
    });

    render(await render_());

    expect(
      screen.getByText('2026年12月3日からQuick Clip スタンダードに変わります')
    ).toBeInTheDocument();
    expect(screen.getByText('予約を取り消す')).toHaveAttribute('data-service', 'quick-clip');
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
      services: [baseService],
    });

    render(await render_({ callbackUrl: ['https://quick-clip.nagiyu.com/a', '/b'] }));

    expect(screen.getByText('申し込む')).toBeInTheDocument();
  });

  it('同じキーを重ねた checkout は success として扱わない', async () => {
    (loadPlansPageData as jest.Mock).mockResolvedValue({
      billingEnabled: true,
      hasCustomer: false,
      services: [baseService],
    });

    render(await render_({ checkout: ['success', 'success'] }));

    expect(syncUserForPlans).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(loadPlansPageData).toHaveBeenCalled();
  });

  describe('本番以外の申し込みの制限', () => {
    const subscribeData = {
      billingEnabled: true,
      hasCustomer: false,
      services: [baseService],
    };

    afterEach(() => {
      process.env.NAGIYU_ENV = 'prod';
    });

    it.each(['dev', undefined])(
      'テスト用ロールが無ければ申し込みを出さず、制限の旨を出す (NAGIYU_ENV=%s)',
      async (env) => {
        if (env === undefined) {
          delete process.env.NAGIYU_ENV;
        } else {
          process.env.NAGIYU_ENV = env;
        }
        (loadPlansPageData as jest.Mock).mockResolvedValue(subscribeData);

        render(await render_());

        expect(screen.queryByText('申し込む')).not.toBeInTheDocument();
        expect(
          screen.getByText('この環境ではテスト用の申し込みに限っています')
        ).toBeInTheDocument();
      }
    );

    it('未ログインはログインへの導線も出さず、制限の旨を出す', async () => {
      process.env.NAGIYU_ENV = 'dev';
      (getSession as jest.Mock).mockResolvedValue(null);
      (loadPlansPageData as jest.Mock).mockResolvedValue({
        ...subscribeData,
        services: [
          { ...baseService, tiers: [{ ...baseCard, state: 'guest', action: 'sign-in' as const }] },
        ],
      });

      render(await render_());

      expect(screen.queryByRole('link', { name: 'ログインして申し込む' })).not.toBeInTheDocument();
      expect(screen.getByText('この環境ではテスト用の申し込みに限っています')).toBeInTheDocument();
    });

    it('テスト用ロールがあれば申し込みを出し、制限の旨は出さない', async () => {
      process.env.NAGIYU_ENV = 'dev';
      (getSession as jest.Mock).mockResolvedValue({
        user: { id: 'u1', roles: ['billing-tester'] },
      });
      (loadPlansPageData as jest.Mock).mockResolvedValue(subscribeData);

      render(await render_());

      expect(screen.getByText('申し込む')).toBeInTheDocument();
      expect(
        screen.queryByText('この環境ではテスト用の申し込みに限っています')
      ).not.toBeInTheDocument();
    });

    it('契約の管理と段の変更・予約の取り消しは変えずに出す', async () => {
      process.env.NAGIYU_ENV = 'dev';
      (loadPlansPageData as jest.Mock).mockResolvedValue({
        billingEnabled: true,
        hasCustomer: true,
        services: [
          {
            ...baseService,
            tiers: [
              {
                ...baseCard,
                state: 'subscribed' as const,
                action: null,
                scheduledChangeLabel: '2026年12月3日に変わります',
              },
              {
                ...baseCard,
                roleId: 'quick-clip-standard',
                action: 'upgrade' as const,
              },
              {
                ...baseCard,
                roleId: 'quick-clip-pro',
                action: 'downgrade' as const,
                downgradeConfirmMessage: '確認',
              },
            ],
          },
        ],
      });

      render(await render_());

      expect(screen.getByText('契約を管理')).toBeInTheDocument();
      expect(screen.getByText('予約を取り消す')).toBeInTheDocument();
      expect(screen.getAllByText('この段に変える')).toHaveLength(2);
      expect(screen.queryByText('申し込む')).not.toBeInTheDocument();
    });

    it('課金が無効なら制限の旨は出さず準備中だけを出す', async () => {
      process.env.NAGIYU_ENV = 'dev';
      mockGetBillingConfig.mockReturnValue(null);

      render(await render_());

      expect(screen.getByText('準備中です')).toBeInTheDocument();
      expect(
        screen.queryByText('この環境ではテスト用の申し込みに限っています')
      ).not.toBeInTheDocument();
    });
  });
});
