import { adaptCharacterSchedule } from '../../../src/lifecycle/adaptation.js';
import { parseTimeToMinutes, smoothTime } from '../../../src/lifecycle/time-utils.js';

const DEFAULT_CURRENT = { bedtime: '01:30', wakeUpTime: '09:30' };

const makeProfile = (morningPeak: string, eveningPeak: string) => ({
  morningPeak,
  eveningPeak,
  sampleSize: 10,
  lastLearnedAt: '2026-06-01T00:00:00.000Z',
});

describe('adaptCharacterSchedule', () => {
  describe('userProfile が null/undefined の場合は current を返す', () => {
    it('null', () => {
      expect(adaptCharacterSchedule(DEFAULT_CURRENT, null)).toEqual(DEFAULT_CURRENT);
    });

    it('undefined', () => {
      expect(adaptCharacterSchedule(DEFAULT_CURRENT, undefined)).toEqual(DEFAULT_CURRENT);
    });
  });

  describe('smoothing=0 のとき current のまま変化しない', () => {
    it('現在値を保持する', () => {
      const result = adaptCharacterSchedule(DEFAULT_CURRENT, makeProfile('09:00', '22:00'), {
        offsetHours: { wakeUp: 1, bedtime: 1.5 },
        smoothing: 0,
      });
      expect(result.bedtime).toBe(DEFAULT_CURRENT.bedtime);
      expect(result.wakeUpTime).toBe(DEFAULT_CURRENT.wakeUpTime);
    });
  });

  describe('smoothing=1 のとき target（クランプ後）に収束する', () => {
    it('通常ユーザー: morningPeak=09:00, eveningPeak=22:00', () => {
      const result = adaptCharacterSchedule(DEFAULT_CURRENT, makeProfile('09:00', '22:00'), {
        offsetHours: { wakeUp: 1, bedtime: 1.5 },
        smoothing: 1,
      });
      // target wakeUpTime = 09:00 - 1h = 08:00（クランプ範囲[05:00,12:00]内）
      expect(result.wakeUpTime).toBe('08:00');
      // target bedtime = 22:00 + 1.5h = 23:30（クランプ範囲[21:00,04:00]内）
      expect(result.bedtime).toBe('23:30');
    });
  });

  describe('smoothing が効く（0.3）', () => {
    it('結果が current と target の間に収まる', () => {
      const profile = makeProfile('09:00', '22:00');
      const result = adaptCharacterSchedule(DEFAULT_CURRENT, profile);
      const currentWake = parseTimeToMinutes(DEFAULT_CURRENT.wakeUpTime);
      const targetWake = parseTimeToMinutes('08:00');
      const resultWake = parseTimeToMinutes(result.wakeUpTime);

      // smoothing=0.3: current(570) → target(480) で中間に向かう
      const expected = smoothTime(currentWake, targetWake, 0.3);
      expect(resultWake).toBeCloseTo(expected, 0);
    });

    it('デフォルト設定で wakeUpTime が前方向に shift する', () => {
      const result = adaptCharacterSchedule(
        { bedtime: '01:30', wakeUpTime: '09:30' },
        makeProfile('09:00', '22:00')
      );
      // 09:30 → target 08:00、smoothing 0.3 で少し早くなる
      const resultMin = parseTimeToMinutes(result.wakeUpTime);
      expect(resultMin).toBeLessThan(parseTimeToMinutes('09:30'));
      expect(resultMin).toBeGreaterThan(parseTimeToMinutes('08:00'));
    });
  });

  describe('クランプ（境界条件）', () => {
    it('極端な早起きユーザー（morningPeak=04:00）: wakeUpTime は 05:00 にクランプ', () => {
      // target = 04:00 - 1h = 03:00 → clamp to 05:00
      const result = adaptCharacterSchedule(DEFAULT_CURRENT, makeProfile('04:00', '21:00'), {
        offsetHours: { wakeUp: 1, bedtime: 1.5 },
        smoothing: 1,
      });
      expect(result.wakeUpTime).toBe('05:00');
    });

    it('極端な夜型ユーザー（morningPeak=14:00）: wakeUpTime は 12:00 にクランプ', () => {
      // target = 14:00 - 1h = 13:00 → clamp to 12:00
      const result = adaptCharacterSchedule(DEFAULT_CURRENT, makeProfile('14:00', '23:00'), {
        offsetHours: { wakeUp: 1, bedtime: 1.5 },
        smoothing: 1,
      });
      expect(result.wakeUpTime).toBe('12:00');
    });

    it('深夜のみ活動（eveningPeak=02:00）: bedtime は 04:00 にクランプ', () => {
      // target = 02:00 + 1.5h = 03:30 → 03:30 は [21:00,04:00] 範囲内
      const result = adaptCharacterSchedule(DEFAULT_CURRENT, makeProfile('09:00', '02:00'), {
        offsetHours: { wakeUp: 1, bedtime: 1.5 },
        smoothing: 1,
      });
      const bedtimeMin = parseTimeToMinutes(result.bedtime);
      expect(bedtimeMin).toBeLessThanOrEqual(4 * 60);
    });

    it('夕方早めに終わるユーザー（eveningPeak=19:00）: bedtime は 21:00 にクランプ', () => {
      // target = 19:00 + 1.5h = 20:30 → [21:00,04:00] 範囲外 → clamp to 21:00
      const result = adaptCharacterSchedule(DEFAULT_CURRENT, makeProfile('09:00', '19:00'), {
        offsetHours: { wakeUp: 1, bedtime: 1.5 },
        smoothing: 1,
      });
      expect(result.bedtime).toBe('21:00');
    });
  });

  describe('0時跨ぎ補間', () => {
    it('bedtime が 23:30 からさらに 01:00 方向に shift する場合、wrap-around で正しく補間', () => {
      const result = adaptCharacterSchedule(
        { bedtime: '23:30', wakeUpTime: '09:30' },
        makeProfile('09:00', '23:00'),
        { offsetHours: { wakeUp: 1, bedtime: 1.5 }, smoothing: 0.3 }
      );
      // target = 23:00 + 1.5h = 00:30 (30min)
      // current bedtime = 23:30 (1410min), target = 30min
      // diff = 30 - 1410 = -1380 < -720 → diff += 1440 = 60
      // smooth = 1410 + 0.3*60 = 1428 = "23:48"
      const resultMin = parseTimeToMinutes(result.bedtime);
      expect(resultMin).toBeGreaterThan(parseTimeToMinutes('23:30'));
    });
  });

  describe('offsetHours のカスタマイズ', () => {
    it('offsetHours を 0 にするとユーザーピークに近づく', () => {
      const result = adaptCharacterSchedule(DEFAULT_CURRENT, makeProfile('08:00', '22:00'), {
        offsetHours: { wakeUp: 0, bedtime: 0 },
        smoothing: 1,
      });
      expect(result.wakeUpTime).toBe('08:00');
      expect(result.bedtime).toBe('22:00');
    });
  });
});
