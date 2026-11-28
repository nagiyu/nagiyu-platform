/**
 * @jest-environment node
 */
import {
  STUDY_DAILY_RESEARCH_LIMIT_GLOBAL,
  STUDY_FREE_TRIAL_DURATION_MS,
} from '@nagiyu/livetalk-core';
import {
  buildAdminStudyStatus,
  formatAdminStudyLines,
  formatTrialLines,
  formatUsageCount,
} from '@/lib/study/admin-study-status';

const DAY = 24 * 60 * 60 * 1000;
const CREATED_AT = Date.parse('2026-11-01T00:00:00Z');
const EMPTY = { userTotal: 0, globalTotal: 0 };

describe('buildAdminStudyStatus', () => {
  it('運営者・スタンダードは区分を返し、お試しを持たない', () => {
    const operator = buildAdminStudyStatus(['livetalk-operator'], CREATED_AT, EMPTY, CREATED_AT);
    const standard = buildAdminStudyStatus(['livetalk-standard'], null, EMPTY, CREATED_AT);
    expect(operator).toMatchObject({ tier: 'operator', trial: null });
    expect(standard).toMatchObject({ tier: 'standard', trial: null });
    expect(standard.user.limit).toBeGreaterThan(0);
  });

  it('無料でお試し中は、終わる日時と上限を返す', () => {
    const status = buildAdminStudyStatus(
      [],
      CREATED_AT,
      { userTotal: 1, globalTotal: 2 },
      CREATED_AT + DAY
    );
    expect(status.tier).toBe('free');
    expect(status.trial).toEqual({
      state: 'active',
      endsAt: CREATED_AT + STUDY_FREE_TRIAL_DURATION_MS,
    });
    expect(status.user).toMatchObject({ used: 1, reached: false });
    expect(status.global).toEqual({
      used: 2,
      limit: STUDY_DAILY_RESEARCH_LIMIT_GLOBAL,
      reached: false,
    });
  });

  it('無料でお試しが終わったら、上限は 0 で達している', () => {
    const now = CREATED_AT + STUDY_FREE_TRIAL_DURATION_MS;
    const status = buildAdminStudyStatus([], CREATED_AT, EMPTY, now);
    expect(status.trial).toEqual({ state: 'ended', endsAt: now });
    expect(status.user).toEqual({ used: 0, limit: 0, reached: true });
  });

  it('無料で Profile がなければ、お試しはまだ始まっていない', () => {
    const status = buildAdminStudyStatus([], null, EMPTY, CREATED_AT);
    expect(status.trial).toEqual({ state: 'not_started' });
    expect(status.user.reached).toBe(true);
  });

  it('利用者の上限に達したら reached になる', () => {
    const base = buildAdminStudyStatus([], CREATED_AT, EMPTY, CREATED_AT);
    const status = buildAdminStudyStatus(
      [],
      CREATED_AT,
      { userTotal: base.user.limit, globalTotal: 0 },
      CREATED_AT
    );
    expect(status.user.reached).toBe(true);
    expect(status.global.reached).toBe(false);
  });

  it('全体の上限に達したら、利用者に余りがあっても global だけ reached になる', () => {
    const status = buildAdminStudyStatus(
      ['livetalk-standard'],
      null,
      { userTotal: 0, globalTotal: STUDY_DAILY_RESEARCH_LIMIT_GLOBAL },
      CREATED_AT
    );
    expect(status.user.reached).toBe(false);
    expect(status.global.reached).toBe(true);
  });
});

describe('表示の整形', () => {
  it('上限に達していなければ印を付けない', () => {
    expect(formatUsageCount('回数: ', { used: 1, limit: 5, reached: false })).toBe('回数: 1 / 5');
  });

  it('上限に達していればそうとわかる', () => {
    expect(formatUsageCount('回数: ', { used: 5, limit: 5, reached: true })).toBe(
      '回数: 5 / 5 (上限に達している)'
    );
  });

  it('お試しは、状態と日本時間の終わる日時を出す', () => {
    // 2026-11-08 09:00 JST
    const endsAt = Date.parse('2026-11-08T00:00:00Z');
    expect(formatTrialLines({ state: 'active', endsAt })).toEqual([
      'お試し中',
      'お試しの終わる日時: 2026/11/08 09:00',
    ]);
    expect(formatTrialLines({ state: 'ended', endsAt })).toEqual([
      'お試しは終わった',
      'お試しの終わる日時: 2026/11/08 09:00',
    ]);
    expect(formatTrialLines({ state: 'not_started' })).toEqual(['お試し: まだ始まっていない']);
  });

  it('3 つの区分の名前を出す', () => {
    const line = (roles: string[]) =>
      formatAdminStudyLines(buildAdminStudyStatus(roles, CREATED_AT, EMPTY, CREATED_AT))[0];
    expect(line(['livetalk-operator'])).toBe('区分: 運営者');
    expect(line(['livetalk-standard'])).toBe('区分: スタンダード');
    expect(line([])).toBe('区分: 無料');
  });

  it('運営者の行にはお試しを含めない', () => {
    const lines = formatAdminStudyLines(
      buildAdminStudyStatus(['livetalk-operator'], CREATED_AT, EMPTY, CREATED_AT)
    );
    expect(lines).toHaveLength(3);
  });
});
