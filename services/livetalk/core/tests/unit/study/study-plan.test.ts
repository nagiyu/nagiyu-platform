import { STUDY_DAILY_RESEARCH_LIMIT_PER_USER } from '../../../src/constants.js';
import {
  STUDY_DAILY_LIMITS,
  STUDY_FREE_TRIAL_DURATION_MS,
  getStudyTrialEndsAt,
  getStudyTrialRemainingMs,
  isStudyTrialActive,
  resolveStudyDailyLimit,
  resolveStudyTier,
} from '../../../src/study/study-plan.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CREATED_AT = Date.parse('2026-11-01T00:00:00Z');

describe('resolveStudyTier', () => {
  it('ロールがなければ無料', () => {
    expect(resolveStudyTier([])).toBe('free');
  });

  it('関係のないロールだけなら無料', () => {
    expect(resolveStudyTier(['quick-clip-pro'])).toBe('free');
  });

  it('スタンダードのロールはスタンダード', () => {
    expect(resolveStudyTier(['livetalk-standard'])).toBe('standard');
  });

  it('運営者のロールは運営者', () => {
    expect(resolveStudyTier(['livetalk-operator'])).toBe('operator');
  });

  it('運営者とスタンダードの両方を持つときは運営者', () => {
    expect(resolveStudyTier(['livetalk-standard', 'livetalk-operator'])).toBe('operator');
  });
});

describe('お試し', () => {
  it('長さは 7 日 (168 時間)', () => {
    expect(STUDY_FREE_TRIAL_DURATION_MS).toBe(168 * 60 * 60 * 1000);
  });

  it('7 日に 1 ms 足りなければお試し中', () => {
    expect(isStudyTrialActive(CREATED_AT, CREATED_AT + 7 * DAY_MS - 1)).toBe(true);
  });

  it('ちょうど 7 日でお試しは終わる', () => {
    expect(isStudyTrialActive(CREATED_AT, CREATED_AT + 7 * DAY_MS)).toBe(false);
  });

  it('作成の直後はお試し中', () => {
    expect(isStudyTrialActive(CREATED_AT, CREATED_AT)).toBe(true);
  });

  it('終わる時刻は作成から 7 日後', () => {
    expect(getStudyTrialEndsAt(CREATED_AT)).toBe(CREATED_AT + 7 * DAY_MS);
  });

  it('残り時間を返し、終わったあとは 0', () => {
    expect(getStudyTrialRemainingMs(CREATED_AT, CREATED_AT + 2 * DAY_MS)).toBe(5 * DAY_MS);
    expect(getStudyTrialRemainingMs(CREATED_AT, CREATED_AT + 7 * DAY_MS)).toBe(0);
    expect(getStudyTrialRemainingMs(CREATED_AT, CREATED_AT + 30 * DAY_MS)).toBe(0);
  });
});

describe('resolveStudyDailyLimit', () => {
  it('運営者は 20 回。お試しは見ない', () => {
    expect(resolveStudyDailyLimit('operator', false)).toBe(20);
  });

  it('スタンダードは 20 回。お試しは見ない', () => {
    expect(resolveStudyDailyLimit('standard', false)).toBe(20);
  });

  it('無料のお試し中は 20 回', () => {
    expect(resolveStudyDailyLimit('free', true)).toBe(20);
  });

  it('無料のお試しのあとは 0 回', () => {
    expect(resolveStudyDailyLimit('free', false)).toBe(0);
  });

  it('値は表と、利用者 1 人あたりの定数から来る', () => {
    expect(STUDY_DAILY_LIMITS.operator).toBe(STUDY_DAILY_RESEARCH_LIMIT_PER_USER);
    expect(STUDY_DAILY_LIMITS.standard).toBe(STUDY_DAILY_RESEARCH_LIMIT_PER_USER);
    expect(STUDY_DAILY_LIMITS.free).toBe(STUDY_DAILY_RESEARCH_LIMIT_PER_USER);
  });
});
