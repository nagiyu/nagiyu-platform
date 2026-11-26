/**
 * @jest-environment node
 */
import { STUDY_FREE_TRIAL_DURATION_MS } from '@nagiyu/livetalk-core';
import { computeStudyStatus } from '@/lib/study/study-status';

const DAY = 24 * 60 * 60 * 1000;
const CREATED_AT = 1_000_000_000_000;

describe('computeStudyStatus', () => {
  describe('区分', () => {
    it('運営者は hidden', () => {
      expect(computeStudyStatus(['livetalk-operator'], CREATED_AT, CREATED_AT)).toEqual({
        state: 'hidden',
      });
    });

    it('スタンダードは、お試しのあとでも hidden', () => {
      const after = CREATED_AT + STUDY_FREE_TRIAL_DURATION_MS + DAY;
      expect(computeStudyStatus(['livetalk-standard'], CREATED_AT, after)).toEqual({
        state: 'hidden',
      });
    });
  });

  describe('無料', () => {
    it('Profile がないときは hidden', () => {
      expect(computeStudyStatus([], null, CREATED_AT)).toEqual({ state: 'hidden' });
    });

    it('作成直後は残りがお試しの全日数', () => {
      expect(computeStudyStatus([], CREATED_AT, CREATED_AT)).toEqual({
        state: 'trial',
        remainingDays: STUDY_FREE_TRIAL_DURATION_MS / DAY,
      });
    });

    it('残りが 1 時間でも 1 日に切り上げる', () => {
      const now = CREATED_AT + STUDY_FREE_TRIAL_DURATION_MS - 60 * 60 * 1000;
      expect(computeStudyStatus([], CREATED_AT, now)).toEqual({
        state: 'trial',
        remainingDays: 1,
      });
    });

    it('残りが 1 日ちょうどなら 1 日、1 ms 超えると 2 日', () => {
      const at = (remainingMs: number) =>
        computeStudyStatus([], CREATED_AT, CREATED_AT + STUDY_FREE_TRIAL_DURATION_MS - remainingMs);
      expect(at(DAY)).toEqual({ state: 'trial', remainingDays: 1 });
      expect(at(DAY + 1)).toEqual({ state: 'trial', remainingDays: 2 });
    });

    it('お試しの終わる時刻ちょうどから ended', () => {
      const end = CREATED_AT + STUDY_FREE_TRIAL_DURATION_MS;
      expect(computeStudyStatus([], CREATED_AT, end - 1)).toEqual({
        state: 'trial',
        remainingDays: 1,
      });
      expect(computeStudyStatus([], CREATED_AT, end)).toEqual({ state: 'ended' });
    });
  });
});
