import type { RoleGrant } from '@nagiyu/common';
import {
  computeStripeGrants,
  isGrantsUnchanged,
  type DesiredStripeRole,
} from '../../../src/billing/grant-diff';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function idGenerator() {
  let n = 0;
  return () => `new-${++n}`;
}

function grant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return {
    grantId: 'g1',
    roleId: 'livetalk-premium',
    source: 'stripe',
    sourceRef: 'sub_1',
    expiresAt: NOW + 10 * DAY,
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    ...overrides,
  };
}

function desired(overrides: Partial<DesiredStripeRole> = {}): DesiredStripeRole {
  return {
    roleId: 'livetalk-premium',
    expiresAt: NOW + 10 * DAY,
    subscriptionId: 'sub_1',
    ...overrides,
  };
}

describe('computeStripeGrants', () => {
  it('権利がなければ作る', () => {
    const result = computeStripeGrants([], [desired()], NOW, idGenerator());

    expect(result).toEqual([
      {
        grantId: 'new-1',
        roleId: 'livetalk-premium',
        source: 'stripe',
        sourceRef: 'sub_1',
        expiresAt: NOW + 10 * DAY,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
  });

  it('期限か参照が違えば更新する', () => {
    const result = computeStripeGrants(
      [grant()],
      [desired({ expiresAt: NOW + 40 * DAY, subscriptionId: 'sub_2' })],
      NOW,
      idGenerator()
    );

    expect(result).toEqual([
      grant({ expiresAt: NOW + 40 * DAY, sourceRef: 'sub_2', updatedAt: NOW }),
    ]);
  });

  it('同じ内容なら権利をそのまま返し、変更なしと判定できる', () => {
    const current = [grant()];

    const result = computeStripeGrants(current, [desired()], NOW, idGenerator());

    expect(result[0]).toBe(current[0]);
    expect(isGrantsUnchanged(current, result)).toBe(true);
  });

  it('望ましいロールにない有効な権利は取り消す', () => {
    const result = computeStripeGrants([grant()], [], NOW, idGenerator());

    expect(result).toEqual([grant({ revokedAt: NOW, updatedAt: NOW })]);
    expect(isGrantsUnchanged([grant()], result)).toBe(false);
  });

  it('手動の権利には触れない', () => {
    const manual = grant({ grantId: 'm1', source: 'manual', sourceRef: 'メモ' });

    const result = computeStripeGrants([manual], [], NOW, idGenerator());

    expect(result).toEqual([manual]);
    expect(result[0]).toBe(manual);
  });

  it('同じロールに手動の権利があっても Stripe の権利を別に作る', () => {
    const manual = grant({ grantId: 'm1', source: 'manual', sourceRef: undefined });

    const result = computeStripeGrants([manual], [desired()], NOW, idGenerator());

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(manual);
    expect(result[1]).toMatchObject({ source: 'stripe', roleId: 'livetalk-premium' });
  });

  it('取り消し済みや期限切れの権利は変更せず、必要なら新しく作る', () => {
    const revoked = grant({ grantId: 'r1', revokedAt: NOW - 1 });
    const expired = grant({ grantId: 'e1', expiresAt: NOW - 1 });

    const result = computeStripeGrants([revoked, expired], [desired()], NOW, idGenerator());

    expect(result[0]).toBe(revoked);
    expect(result[1]).toBe(expired);
    expect(result[2]).toMatchObject({ grantId: 'new-1', source: 'stripe' });
  });

  it('期限切れの権利は望ましいロールになくても取り消さない', () => {
    const expired = grant({ expiresAt: NOW - 1 });

    const result = computeStripeGrants([expired], [], NOW, idGenerator());

    expect(result[0]).toBe(expired);
  });

  it('期限が現在以前の望ましいロールは無視する', () => {
    const result = computeStripeGrants([], [desired({ expiresAt: NOW })], NOW, idGenerator());

    expect(result).toEqual([]);
  });

  it('同じロールを複数の契約が与えるときは期限が遅いものを採る', () => {
    const result = computeStripeGrants(
      [],
      [
        desired({ subscriptionId: 'sub_a', expiresAt: NOW + 5 * DAY }),
        desired({ subscriptionId: 'sub_b', expiresAt: NOW + 20 * DAY }),
      ],
      NOW,
      idGenerator()
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ sourceRef: 'sub_b', expiresAt: NOW + 20 * DAY });
  });

  it('期限が同じなら契約 ID の小さい方を採り、順序に依存しない', () => {
    const a = desired({ subscriptionId: 'sub_a' });
    const b = desired({ subscriptionId: 'sub_b' });

    const forward = computeStripeGrants([], [a, b], NOW, idGenerator());
    const backward = computeStripeGrants([], [b, a], NOW, idGenerator());

    expect(forward).toEqual(backward);
    expect(forward[0].sourceRef).toBe('sub_a');
  });

  it('同じロールに有効な Stripe の権利が複数あれば先頭だけ残して余りを取り消す', () => {
    const first = grant({ grantId: 'g1' });
    const second = grant({ grantId: 'g2' });

    const result = computeStripeGrants([first, second], [desired()], NOW, idGenerator());

    expect(result[0]).toBe(first);
    expect(result[1]).toEqual({ ...second, revokedAt: NOW, updatedAt: NOW });
  });

  it('複数のロールを roleId の順に作る', () => {
    const result = computeStripeGrants(
      [],
      [desired({ roleId: 'quick-clip-premium' }), desired({ roleId: 'livetalk-premium' })],
      NOW,
      idGenerator()
    );

    expect(result.map((g) => g.roleId)).toEqual(['livetalk-premium', 'quick-clip-premium']);
  });

  describe('冪等性', () => {
    it('結果を入力にして同じ望ましいロールで再計算しても変わらない', () => {
      const wanted = [
        desired(),
        desired({ roleId: 'quick-clip-premium', subscriptionId: 'sub_2' }),
      ];
      const first = computeStripeGrants([], wanted, NOW, idGenerator());

      const second = computeStripeGrants(first, wanted, NOW + 1000, idGenerator());

      expect(second).toEqual(first);
      expect(isGrantsUnchanged(first, second)).toBe(true);
    });

    it('取り消した後に同じ入力で再計算しても変わらない', () => {
      const first = computeStripeGrants([grant()], [], NOW, idGenerator());

      const second = computeStripeGrants(first, [], NOW + 1000, idGenerator());

      expect(second).toEqual(first);
    });

    it('望ましいロールの並び順や重複が違っても結果は同じ', () => {
      const a = desired({ roleId: 'livetalk-premium' });
      const b = desired({ roleId: 'quick-clip-premium', subscriptionId: 'sub_2' });

      const ordered = computeStripeGrants([], [a, b], NOW, idGenerator());
      const shuffled = computeStripeGrants([], [b, a, a, b], NOW, idGenerator());

      expect(
        shuffled.map(({ roleId, sourceRef, expiresAt }) => ({ roleId, sourceRef, expiresAt }))
      ).toEqual(
        ordered.map(({ roleId, sourceRef, expiresAt }) => ({ roleId, sourceRef, expiresAt }))
      );
    });
  });
});

describe('isGrantsUnchanged', () => {
  it('長さが違えば変更あり', () => {
    expect(isGrantsUnchanged([grant()], [])).toBe(false);
  });
});
