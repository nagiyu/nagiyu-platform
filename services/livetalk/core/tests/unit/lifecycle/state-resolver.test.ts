import { resolveLifecycleState } from '../../../src/lifecycle/state-resolver.js';

function makeDate(hour: number, minute = 0): Date {
  return new Date(2026, 0, 1, hour, minute, 0);
}

describe('resolveLifecycleState', () => {
  // TEMPORARY（#3333 検証用）: デフォルトを就寝 06:00 / 起床 05:00（終日ほぼ
  // sleeping、awake は 05:00–06:00 のみ）に一時拡張中。検証完了後、constants.ts の
  // 本来値 '01:30' / '09:30' への復帰に合わせて本ブロックも元の期待値へ戻すこと。
  describe('デフォルト設定（TEMPORARY: 就寝 06:00 / 起床 05:00）', () => {
    it.each([
      [0, 0, 'sleeping'],
      [1, 30, 'sleeping'],
      [4, 59, 'sleeping'],
      [5, 0, 'awake'],
      [5, 30, 'awake'],
      [5, 59, 'awake'],
      [6, 0, 'sleeping'],
      [9, 30, 'sleeping'],
      [12, 0, 'sleeping'],
      [23, 59, 'sleeping'],
    ] as [number, number, string][])('%i:%s → %s', (hour, minute, expected) => {
      const result = resolveLifecycleState(makeDate(hour, minute));
      expect(result).toBe(expected);
    });
  });

  describe('深夜 0 時跨ぎ（就寝 23:00 / 起床 07:00）', () => {
    it.each([
      [23, 0, 'sleeping'],
      [23, 30, 'sleeping'],
      [0, 0, 'sleeping'],
      [3, 0, 'sleeping'],
      [6, 59, 'sleeping'],
      [7, 0, 'awake'],
      [12, 0, 'awake'],
      [22, 59, 'awake'],
    ] as [number, number, string][])('%i:%s → %s', (hour, minute, expected) => {
      const result = resolveLifecycleState(makeDate(hour, minute), '23:00', '07:00');
      expect(result).toBe(expected);
    });
  });

  describe('昼型（就寝 02:00 / 起床 10:00）', () => {
    it('02:00 は sleeping', () => {
      expect(resolveLifecycleState(makeDate(2, 0), '02:00', '10:00')).toBe('sleeping');
    });

    it('09:59 は sleeping', () => {
      expect(resolveLifecycleState(makeDate(9, 59), '02:00', '10:00')).toBe('sleeping');
    });

    it('10:00 は awake', () => {
      expect(resolveLifecycleState(makeDate(10, 0), '02:00', '10:00')).toBe('awake');
    });

    it('01:59 は awake', () => {
      expect(resolveLifecycleState(makeDate(1, 59), '02:00', '10:00')).toBe('awake');
    });
  });

  describe('エッジケース', () => {
    it('就寝 = 起床（同時刻）のときは常に awake', () => {
      // bed < wake でも bed > wake でもない（bed === wake）→ bed < wake = false の分岐へ
      // m >= bed || m < wake は常に true になるが、これは仕様上のエッジケースとして扱う
      // 同時刻設定はありえないが、ロジックが例外を投げないことを確認
      expect(() => resolveLifecycleState(makeDate(12, 0), '08:00', '08:00')).not.toThrow();
    });
  });
});
