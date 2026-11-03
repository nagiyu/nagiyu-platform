import type { RoleGrant } from '@nagiyu/common';
import {
  buildPlanCards,
  formatPlanDate,
  formatPriceLabel,
  type BuildPlanCardsInput,
} from '../../../src/lib/plans';

const NOW = Date.parse('2026-11-03T00:00:00+09:00');
const DAY = 24 * 60 * 60 * 1000;
const MONTHLY = {
  unit_amount: 500,
  currency: 'jpy',
  recurring: { interval: 'month', interval_count: 1 },
};

function input(overrides: Partial<BuildPlanCardsInput> = {}): BuildPlanCardsInput {
  return {
    loggedIn: true,
    prices: new Map([['livetalk-premium', MONTHLY]]),
    subscriptions: [],
    grants: [],
    now: NOW,
    ...overrides,
  };
}

function card(roleId: string, overrides: Partial<BuildPlanCardsInput> = {}) {
  const found = buildPlanCards(input(overrides)).find((c) => c.roleId === roleId);
  if (!found) throw new Error('card not found');
  return found;
}

function grant(partial: Partial<RoleGrant>): RoleGrant {
  return {
    grantId: 'g',
    roleId: 'livetalk-premium',
    source: 'manual',
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe('formatPriceLabel', () => {
  it('日本円の月額を「月額 ¥500 (税込)」にする', () => {
    expect(formatPriceLabel(MONTHLY)).toBe('月額 ¥500 (税込)');
  });

  it('小数を持つ通貨は最小単位から主単位に直す', () => {
    expect(formatPriceLabel({ ...MONTHLY, unit_amount: 500, currency: 'usd' })).toBe(
      '月額 $5.00 (税込)'
    );
  });

  it('年額と複数期間の周期を表す', () => {
    expect(
      formatPriceLabel({ ...MONTHLY, recurring: { interval: 'year', interval_count: 1 } })
    ).toBe('年額 ¥500 (税込)');
    expect(
      formatPriceLabel({ ...MONTHLY, recurring: { interval: 'month', interval_count: 3 } })
    ).toBe('3か月ごと ¥500 (税込)');
  });

  it('周期が無い・未知の Price は周期を付けない', () => {
    expect(formatPriceLabel({ ...MONTHLY, recurring: null })).toBe('¥500 (税込)');
    expect(
      formatPriceLabel({ ...MONTHLY, recurring: { interval: 'decade', interval_count: 1 } })
    ).toBe('¥500 (税込)');
  });

  it('Price が無い・金額が読めなければ null', () => {
    expect(formatPriceLabel(undefined)).toBeNull();
    expect(formatPriceLabel({ ...MONTHLY, unit_amount: null })).toBeNull();
  });
});

describe('formatPlanDate', () => {
  it('日本時間の日付にする', () => {
    expect(formatPlanDate(Date.parse('2026-12-03T20:00:00Z'))).toBe('2026年12月4日');
  });
});

describe('buildPlanCards', () => {
  it('有料ロールごとにカードを作る', () => {
    expect(buildPlanCards(input()).map((c) => c.roleId)).toEqual([
      'livetalk-premium',
      'quick-clip-premium',
    ]);
    expect(card('livetalk-premium').name).toBe('LiveTalk プレミアム');
  });

  it('未ログインは申し込みを出さず、手動の権利も見せない', () => {
    const c = card('livetalk-premium', {
      loggedIn: false,
      subscriptions: null,
      grants: [grant({ expiresAt: NOW + DAY })],
    });

    expect(c).toMatchObject({ state: 'guest', canSubscribe: false, manualLabel: null });
    expect(c.priceLabel).toBe('月額 ¥500 (税込)');
  });

  it('未契約で Price があれば申し込める。Price が無ければ申し込めない', () => {
    expect(card('livetalk-premium').canSubscribe).toBe(true);
    const noPrice = card('quick-clip-premium');
    expect(noPrice).toMatchObject({ state: 'none', priceLabel: null, canSubscribe: false });
  });

  it('契約中は次の更新日を出す', () => {
    const c = card('livetalk-premium', {
      subscriptions: [
        {
          roleId: 'livetalk-premium',
          currentPeriodEnd: Date.parse('2026-12-03T00:00:00+09:00'),
          endsAt: null,
        },
      ],
    });

    expect(c).toMatchObject({
      state: 'subscribed',
      stateLabel: '次の更新日: 2026年12月3日',
      canSubscribe: false,
    });
  });

  it('解約予約中は終了日を出す', () => {
    const c = card('livetalk-premium', {
      subscriptions: [
        {
          roleId: 'livetalk-premium',
          currentPeriodEnd: NOW + 10 * DAY,
          endsAt: Date.parse('2026-11-20T00:00:00+09:00'),
        },
      ],
    });

    expect(c).toMatchObject({ state: 'canceling', stateLabel: '2026年11月20日に終了します' });
  });

  it('同じロールの契約が複数あれば、解約予約のないものを優先する', () => {
    const c = card('livetalk-premium', {
      subscriptions: [
        { roleId: 'livetalk-premium', currentPeriodEnd: NOW + 30 * DAY, endsAt: NOW + 30 * DAY },
        { roleId: 'livetalk-premium', currentPeriodEnd: NOW + 10 * DAY, endsAt: null },
      ],
    });

    expect(c.state).toBe('subscribed');
  });

  it('別のロールの契約は影響しない', () => {
    const c = card('livetalk-premium', {
      subscriptions: [{ roleId: 'quick-clip-premium', currentPeriodEnd: NOW + DAY, endsAt: null }],
    });

    expect(c.state).toBe('none');
  });

  it('Stripe から取れなかったときは、有効な Stripe の権利があれば契約中とする', () => {
    const active = card('livetalk-premium', {
      subscriptions: null,
      grants: [grant({ source: 'stripe', expiresAt: NOW + DAY })],
    });
    const expired = card('livetalk-premium', {
      subscriptions: null,
      grants: [grant({ source: 'stripe', expiresAt: NOW - DAY })],
    });
    const none = card('livetalk-premium', { subscriptions: null });

    expect(active).toMatchObject({ state: 'subscribed', stateLabel: null });
    expect(expired.state).toBe('none');
    expect(none.state).toBe('none');
  });

  it('有効な手動の権利の期限を、契約とは別に出す', () => {
    const c = card('livetalk-premium', {
      grants: [
        grant({ expiresAt: Date.parse('2026-11-30T00:00:00+09:00') }),
        grant({ expiresAt: Date.parse('2026-12-31T00:00:00+09:00') }),
        grant({ expiresAt: NOW - DAY }),
        grant({ expiresAt: NOW + 99 * DAY, revokedAt: NOW - 1 }),
      ],
    });

    expect(c.manualLabel).toBe('運営による付与があります (2026年12月31日まで)');
    expect(c.state).toBe('none');
  });

  it('期限のない手動の権利は期限なしと出す', () => {
    expect(card('livetalk-premium', { grants: [grant({})] }).manualLabel).toBe(
      '運営による付与があります (期限なし)'
    );
  });

  it('手動の権利が無ければ何も出さない', () => {
    expect(
      card('livetalk-premium', { grants: [grant({ source: 'stripe' })] }).manualLabel
    ).toBeNull();
  });
});
