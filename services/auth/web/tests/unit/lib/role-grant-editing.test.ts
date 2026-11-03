import type { RoleGrant } from '@nagiyu/common';
import {
  EMPTY_PENDING_GRANT_CHANGES,
  GRANT_EDITING_ERROR_MESSAGES,
  addPendingGrant,
  addPendingRevoke,
  buildGrantChanges,
  buildGrantRows,
  expiresAtToJstDate,
  getTodayJstDate,
  hasPendingGrantChanges,
  jstDateToExpiresAt,
  parseExpiryInput,
  removePendingAdd,
  setPendingExtend,
  undoPendingForGrant,
} from '../../../src/lib/role-grant-editing';

// 2026-11-03 12:00 JST
const NOW = Date.UTC(2026, 10, 3, 3, 0, 0);

const grant = (overrides: Partial<RoleGrant> = {}): RoleGrant => ({
  grantId: 'g1',
  roleId: 'admin',
  source: 'manual',
  expiresAt: jstDateToExpiresAt('2026-12-31') as number,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe('日付の換算', () => {
  it('日付をその日の終わり (日本時間) に換算する', () => {
    expect(jstDateToExpiresAt('2026-11-03')).toBe(Date.UTC(2026, 10, 3, 14, 59, 59, 999));
  });

  it('日本時間の日付に戻せる', () => {
    expect(expiresAtToJstDate(Date.UTC(2026, 10, 3, 14, 59, 59, 999))).toBe('2026-11-03');
    expect(expiresAtToJstDate(Date.UTC(2026, 10, 3, 15, 0, 0, 0))).toBe('2026-11-04');
  });

  it('うるう日を扱える', () => {
    expect(expiresAtToJstDate(jstDateToExpiresAt('2028-02-29') as number)).toBe('2028-02-29');
  });

  it.each(['', '2026-13-01', '2026-02-30', '2026/11/03', '26-11-03'])(
    '不正な日付 %s は null',
    (value) => {
      expect(jstDateToExpiresAt(value)).toBeNull();
    }
  );

  it('現在時刻の日本時間の日付を返す', () => {
    expect(getTodayJstDate(Date.UTC(2026, 10, 3, 15, 30))).toBe('2026-11-04');
  });
});

describe('parseExpiryInput', () => {
  it('今日の日付は選べる', () => {
    const result = parseExpiryInput('2026-11-03', NOW);
    expect(result).toEqual({ ok: true, expiresAt: jstDateToExpiresAt('2026-11-03') });
  });

  it('空・不正・過去を弾く', () => {
    expect(parseExpiryInput('', NOW)).toEqual({
      ok: false,
      error: GRANT_EDITING_ERROR_MESSAGES.DATE_REQUIRED,
    });
    expect(parseExpiryInput('2026-02-30', NOW)).toEqual({
      ok: false,
      error: GRANT_EDITING_ERROR_MESSAGES.DATE_INVALID,
    });
    expect(parseExpiryInput('2026-11-02', NOW)).toEqual({
      ok: false,
      error: GRANT_EDITING_ERROR_MESSAGES.DATE_NOT_FUTURE,
    });
  });
});

describe('保存前の変更', () => {
  it('追加はロール・期限・メモを検証して足す', () => {
    const result = addPendingGrant(
      EMPTY_PENDING_GRANT_CHANGES,
      { key: 'k', roleId: 'admin', date: '2026-12-01', sourceRef: '  支援  ' },
      NOW
    );
    expect(result).toEqual({
      ok: true,
      pending: {
        adds: [
          {
            key: 'k',
            roleId: 'admin',
            expiresAt: jstDateToExpiresAt('2026-12-01'),
            sourceRef: '支援',
          },
        ],
        extends: {},
        revokes: [],
      },
    });
  });

  it('メモが空なら持たない', () => {
    const result = addPendingGrant(
      EMPTY_PENDING_GRANT_CHANGES,
      { key: 'k', roleId: 'admin', date: '2026-12-01', sourceRef: ' ' },
      NOW
    );
    expect(result.ok && result.pending.adds[0]).not.toHaveProperty('sourceRef');
  });

  it('追加の入力エラーを返す', () => {
    const base = { key: 'k', roleId: 'admin', date: '2026-12-01', sourceRef: '' };
    expect(addPendingGrant(EMPTY_PENDING_GRANT_CHANGES, { ...base, roleId: '' }, NOW)).toEqual({
      ok: false,
      error: GRANT_EDITING_ERROR_MESSAGES.ROLE_REQUIRED,
    });
    expect(addPendingGrant(EMPTY_PENDING_GRANT_CHANGES, { ...base, date: '' }, NOW).ok).toBe(false);
    expect(
      addPendingGrant(EMPTY_PENDING_GRANT_CHANGES, { ...base, sourceRef: 'a'.repeat(201) }, NOW)
    ).toEqual({ ok: false, error: GRANT_EDITING_ERROR_MESSAGES.NOTE_TOO_LONG });
  });

  it('期限の変更を足し、不正なら弾く', () => {
    const result = setPendingExtend(EMPTY_PENDING_GRANT_CHANGES, grant(), '2027-01-15', NOW);
    expect(result.ok && result.pending.extends).toEqual({ g1: jstDateToExpiresAt('2027-01-15') });
    expect(setPendingExtend(EMPTY_PENDING_GRANT_CHANGES, grant(), '2020-01-01', NOW).ok).toBe(
      false
    );
  });

  it('有効な権利を今の期限と同じ日にする変更は持たない', () => {
    const start = { ...EMPTY_PENDING_GRANT_CHANGES, extends: { g1: 5 } };
    const result = setPendingExtend(start, grant(), '2026-12-31', NOW);
    expect(result.ok && result.pending.extends).toEqual({});
  });

  it('期限切れの権利は同じ日でも変更として持つ', () => {
    // 今日の午前 9 時 (日本時間) に切れた権利は、日付が同じでも期限切れである
    const expired = grant({ expiresAt: Date.UTC(2026, 10, 3, 0, 0) });
    const result = setPendingExtend(EMPTY_PENDING_GRANT_CHANGES, expired, '2026-11-03', NOW);
    expect(result.ok && Object.keys(result.pending.extends)).toEqual(['g1']);
  });

  it('取り消しは同じ権利の期限変更を外し、重複しない', () => {
    const start = { ...EMPTY_PENDING_GRANT_CHANGES, extends: { g1: 5 } };
    const once = addPendingRevoke(start, 'g1');
    expect(once).toEqual({ adds: [], extends: {}, revokes: ['g1'] });
    expect(addPendingRevoke(once, 'g1').revokes).toEqual(['g1']);
  });

  it('元に戻す・追加の取りやめができる', () => {
    const pending = {
      adds: [{ key: 'k', roleId: 'admin', expiresAt: 1 }],
      extends: { g1: 5 },
      revokes: ['g2'],
    };
    expect(undoPendingForGrant(pending, 'g1').extends).toEqual({});
    expect(undoPendingForGrant(pending, 'g2').revokes).toEqual([]);
    expect(removePendingAdd(pending, 'k').adds).toEqual([]);
  });

  it('変更の有無を判定する', () => {
    expect(hasPendingGrantChanges(EMPTY_PENDING_GRANT_CHANGES)).toBe(false);
    expect(hasPendingGrantChanges({ ...EMPTY_PENDING_GRANT_CHANGES, revokes: ['g1'] })).toBe(true);
  });
});

describe('buildGrantChanges', () => {
  it('変更がなければ undefined', () => {
    expect(buildGrantChanges(EMPTY_PENDING_GRANT_CHANGES)).toBeUndefined();
  });

  it('add / extend / revoke を API の形にする', () => {
    expect(
      buildGrantChanges({
        adds: [
          { key: 'a', roleId: 'admin', expiresAt: 1, sourceRef: 'm' },
          { key: 'b', roleId: 'user-manager', expiresAt: 2 },
        ],
        extends: { g1: 3 },
        revokes: ['g2'],
      })
    ).toEqual({
      add: [
        { roleId: 'admin', expiresAt: 1, sourceRef: 'm' },
        { roleId: 'user-manager', expiresAt: 2 },
      ],
      extend: [{ grantId: 'g1', expiresAt: 3 }],
      revoke: ['g2'],
    });
  });

  it('変更のある種類だけを含める', () => {
    expect(buildGrantChanges({ ...EMPTY_PENDING_GRANT_CHANGES, revokes: ['g2'] })).toEqual({
      revoke: ['g2'],
    });
  });
});

describe('buildGrantRows', () => {
  it('Stripe 由来・取り消し済みは操作できない', () => {
    const rows = buildGrantRows(
      [
        grant({ grantId: 'm' }),
        grant({ grantId: 's', source: 'stripe' }),
        grant({ grantId: 'r', revokedAt: 1 }),
      ],
      EMPTY_PENDING_GRANT_CHANGES,
      NOW
    );
    expect(rows.map((r) => [r.rowKey, r.operable, r.status])).toEqual([
      ['m', true, 'active'],
      ['s', false, 'active'],
      ['r', false, 'revoked'],
    ]);
  });

  it('期限切れは操作できる (復活のため)', () => {
    const [row] = buildGrantRows([grant({ expiresAt: 1 })], EMPTY_PENDING_GRANT_CHANGES, NOW);
    expect(row.status).toBe('expired');
    expect(row.operable).toBe(true);
  });

  it('期限変更予定は新しい期限と状態を反映し、変更前を持つ', () => {
    const newExpiry = jstDateToExpiresAt('2027-01-01') as number;
    const [row] = buildGrantRows(
      [grant({ expiresAt: 1 })],
      { ...EMPTY_PENDING_GRANT_CHANGES, extends: { g1: newExpiry } },
      NOW
    );
    expect(row).toMatchObject({
      expiresAt: newExpiry,
      previousExpiresAt: 1,
      status: 'active',
      pending: 'extend',
    });
  });

  it('取り消し予定は操作を出さず、追加予定を末尾に足す', () => {
    const rows = buildGrantRows(
      [grant()],
      {
        adds: [{ key: 'k', roleId: 'admin', expiresAt: 9, sourceRef: 'm' }],
        extends: {},
        revokes: ['g1'],
      },
      NOW
    );
    expect(rows[0]).toMatchObject({ pending: 'revoke', operable: false });
    expect(rows[1]).toMatchObject({
      rowKey: 'add:k',
      addKey: 'k',
      pending: 'add',
      sourceRef: 'm',
      source: 'manual',
    });
  });
});
