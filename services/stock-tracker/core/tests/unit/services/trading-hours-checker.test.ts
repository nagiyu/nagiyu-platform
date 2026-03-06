/**
 * Stock Tracker Core - Trading Hours Checker Service Unit Tests
 *
 * 取引時間外判定ロジックのユニットテスト
 */

import {
  isTradingHours,
  getLastTradingDate,
  calculateTemporaryExpireDate,
  TRADING_HOURS_ERROR_MESSAGES,
} from '../../../src/services/trading-hours-checker.js';
import type { Exchange } from '../../../src/types.js';

describe('Trading Hours Checker Service', () => {
  // NASDAQ (America/New_York, 04:00-20:00)
  const nasdaq: Exchange = {
    ExchangeID: 'NASDAQ',
    Name: 'NASDAQ',
    Key: 'NSDQ',
    Timezone: 'America/New_York',
    Start: '04:00', // プレマーケット開始時刻
    End: '20:00', // アフターマーケット終了時刻
    CreatedAt: Date.now(),
    UpdatedAt: Date.now(),
  };

  // 東京証券取引所 (Asia/Tokyo, 09:00-15:00)
  const tse: Exchange = {
    ExchangeID: 'TSE',
    Name: '東京証券取引所',
    Key: 'TSE',
    Timezone: 'Asia/Tokyo',
    Start: '09:00',
    End: '15:00',
    CreatedAt: Date.now(),
    UpdatedAt: Date.now(),
  };

  describe('NASDAQ (America/New_York, 04:00-20:00)', () => {
    describe('取引時間内', () => {
      it('平日の取引時間内 (09:00 EST) の場合、true を返す', () => {
        // 2024-01-15 (月曜日) 09:00 EST = 2024-01-15 14:00 UTC
        const tradingHours = new Date('2024-01-15T14:00:00Z');
        expect(isTradingHours(nasdaq, tradingHours)).toBe(true);
      });

      it('平日の取引時間内 (15:30 EST) の場合、true を返す', () => {
        // 2024-01-16 (火曜日) 15:30 EST = 2024-01-16 20:30 UTC
        const tradingHours = new Date('2024-01-16T20:30:00Z');
        expect(isTradingHours(nasdaq, tradingHours)).toBe(true);
      });

      it('平日の取引時間内 (04:00 EST - 開始時刻) の場合、true を返す', () => {
        // 2024-01-17 (水曜日) 04:00 EST = 2024-01-17 09:00 UTC
        const tradingStart = new Date('2024-01-17T09:00:00Z');
        expect(isTradingHours(nasdaq, tradingStart)).toBe(true);
      });
    });

    describe('取引時間外', () => {
      it('平日の取引時間外 (20:00 EST - 終了時刻) の場合、false を返す', () => {
        // 2024-01-15 (月曜日) 20:00 EST = 2024-01-16 01:00 UTC
        const afterHours = new Date('2024-01-16T01:00:00Z');
        expect(isTradingHours(nasdaq, afterHours)).toBe(false);
      });

      it('平日の取引時間外 (21:00 EST) の場合、false を返す', () => {
        // 2024-01-15 (月曜日) 21:00 EST = 2024-01-16 02:00 UTC
        const afterHours = new Date('2024-01-16T02:00:00Z');
        expect(isTradingHours(nasdaq, afterHours)).toBe(false);
      });

      it('平日の取引時間外 (03:59 EST - 開始直前) の場合、false を返す', () => {
        // 2024-01-17 (水曜日) 03:59 EST = 2024-01-17 08:59 UTC
        const beforeHours = new Date('2024-01-17T08:59:00Z');
        expect(isTradingHours(nasdaq, beforeHours)).toBe(false);
      });
    });

    describe('土日 (取引時間外)', () => {
      it('土曜日の場合、false を返す', () => {
        // 2024-01-13 (土曜日) 10:00 EST = 2024-01-13 15:00 UTC
        const saturday = new Date('2024-01-13T15:00:00Z');
        expect(isTradingHours(nasdaq, saturday)).toBe(false);
      });

      it('日曜日の場合、false を返す', () => {
        // 2024-01-14 (日曜日) 10:00 EST = 2024-01-14 15:00 UTC
        const sunday = new Date('2024-01-14T15:00:00Z');
        expect(isTradingHours(nasdaq, sunday)).toBe(false);
      });

      it('土曜日の取引時間帯 (09:00 EST) でも false を返す', () => {
        // 2024-01-13 (土曜日) 09:00 EST = 2024-01-13 14:00 UTC
        const saturdayTradingHours = new Date('2024-01-13T14:00:00Z');
        expect(isTradingHours(nasdaq, saturdayTradingHours)).toBe(false);
      });

      it('日曜日の取引時間帯 (09:00 EST) でも false を返す', () => {
        // 2024-01-14 (日曜日) 09:00 EST = 2024-01-14 14:00 UTC
        const sundayTradingHours = new Date('2024-01-14T14:00:00Z');
        expect(isTradingHours(nasdaq, sundayTradingHours)).toBe(false);
      });
    });

    describe('境界値テスト', () => {
      it('取引開始時刻 (04:00 EST) の場合、true を返す', () => {
        // 2024-01-15 (月曜日) 04:00:00 EST = 2024-01-15 09:00:00 UTC
        const startTime = new Date('2024-01-15T09:00:00Z');
        expect(isTradingHours(nasdaq, startTime)).toBe(true);
      });

      it('取引開始直前 (03:59 EST) の場合、false を返す', () => {
        // 2024-01-15 (月曜日) 03:59:59 EST = 2024-01-15 08:59:59 UTC
        const beforeStartTime = new Date('2024-01-15T08:59:59Z');
        expect(isTradingHours(nasdaq, beforeStartTime)).toBe(false);
      });

      it('取引終了時刻 (20:00 EST) の場合、false を返す', () => {
        // 2024-01-15 (月曜日) 20:00:00 EST = 2024-01-16 01:00:00 UTC
        const endTime = new Date('2024-01-16T01:00:00Z');
        expect(isTradingHours(nasdaq, endTime)).toBe(false);
      });

      it('取引終了直前 (19:59 EST) の場合、true を返す', () => {
        // 2024-01-15 (月曜日) 19:59:59 EST = 2024-01-16 00:59:59 UTC
        const beforeEndTime = new Date('2024-01-16T00:59:59Z');
        expect(isTradingHours(nasdaq, beforeEndTime)).toBe(true);
      });
    });
  });

  describe('東京証券取引所 (Asia/Tokyo, 09:00-15:00)', () => {
    describe('取引時間内', () => {
      it('平日の取引時間内 (10:00 JST) の場合、true を返す', () => {
        // 2024-01-15 (月曜日) 10:00 JST = 2024-01-15 01:00 UTC
        const tradingHours = new Date('2024-01-15T01:00:00Z');
        expect(isTradingHours(tse, tradingHours)).toBe(true);
      });

      it('平日の取引時間内 (14:30 JST) の場合、true を返す', () => {
        // 2024-01-16 (火曜日) 14:30 JST = 2024-01-16 05:30 UTC
        const tradingHours = new Date('2024-01-16T05:30:00Z');
        expect(isTradingHours(tse, tradingHours)).toBe(true);
      });

      it('平日の取引開始時刻 (09:00 JST) の場合、true を返す', () => {
        // 2024-01-17 (水曜日) 09:00 JST = 2024-01-17 00:00 UTC
        const tradingStart = new Date('2024-01-17T00:00:00Z');
        expect(isTradingHours(tse, tradingStart)).toBe(true);
      });
    });

    describe('取引時間外', () => {
      it('平日の取引時間外 (08:00 JST) の場合、false を返す', () => {
        // 2024-01-15 (月曜日) 08:00 JST = 2024-01-14 23:00 UTC
        const beforeHours = new Date('2024-01-14T23:00:00Z');
        expect(isTradingHours(tse, beforeHours)).toBe(false);
      });

      it('平日の取引時間外 (15:00 JST - 終了時刻) の場合、false を返す', () => {
        // 2024-01-15 (月曜日) 15:00 JST = 2024-01-15 06:00 UTC
        const afterHours = new Date('2024-01-15T06:00:00Z');
        expect(isTradingHours(tse, afterHours)).toBe(false);
      });

      it('平日の取引時間外 (16:00 JST) の場合、false を返す', () => {
        // 2024-01-15 (月曜日) 16:00 JST = 2024-01-15 07:00 UTC
        const afterHours = new Date('2024-01-15T07:00:00Z');
        expect(isTradingHours(tse, afterHours)).toBe(false);
      });
    });

    describe('土日 (取引時間外)', () => {
      it('土曜日の場合、false を返す', () => {
        // 2024-01-13 (土曜日) 10:00 JST = 2024-01-13 01:00 UTC
        const saturday = new Date('2024-01-13T01:00:00Z');
        expect(isTradingHours(tse, saturday)).toBe(false);
      });

      it('日曜日の場合、false を返す', () => {
        // 2024-01-14 (日曜日) 10:00 JST = 2024-01-14 01:00 UTC
        const sunday = new Date('2024-01-14T01:00:00Z');
        expect(isTradingHours(tse, sunday)).toBe(false);
      });
    });

    describe('境界値テスト', () => {
      it('取引開始時刻 (09:00 JST) の場合、true を返す', () => {
        // 2024-01-15 (月曜日) 09:00:00 JST = 2024-01-15 00:00:00 UTC
        const startTime = new Date('2024-01-15T00:00:00Z');
        expect(isTradingHours(tse, startTime)).toBe(true);
      });

      it('取引開始直前 (08:59 JST) の場合、false を返す', () => {
        // 2024-01-15 (月曜日) 08:59:59 JST = 2024-01-14 23:59:59 UTC
        const beforeStartTime = new Date('2024-01-14T23:59:59Z');
        expect(isTradingHours(tse, beforeStartTime)).toBe(false);
      });

      it('取引終了時刻 (15:00 JST) の場合、false を返す', () => {
        // 2024-01-15 (月曜日) 15:00:00 JST = 2024-01-15 06:00:00 UTC
        const endTime = new Date('2024-01-15T06:00:00Z');
        expect(isTradingHours(tse, endTime)).toBe(false);
      });

      it('取引終了直前 (14:59 JST) の場合、true を返す', () => {
        // 2024-01-15 (月曜日) 14:59:59 JST = 2024-01-15 05:59:59 UTC
        const beforeEndTime = new Date('2024-01-15T05:59:59Z');
        expect(isTradingHours(tse, beforeEndTime)).toBe(true);
      });
    });
  });

  describe('Unix timestamp 入力', () => {
    it('Unix timestamp を入力として受け付ける', () => {
      // 2024-01-15 (月曜日) 09:00 EST = 2024-01-15 14:00 UTC
      const timestamp = new Date('2024-01-15T14:00:00Z').getTime();
      expect(isTradingHours(nasdaq, timestamp)).toBe(true);
    });

    it('Unix timestamp (取引時間外) を入力として受け付ける', () => {
      // 2024-01-13 (土曜日) 09:00 EST = 2024-01-13 14:00 UTC
      const timestamp = new Date('2024-01-13T14:00:00Z').getTime();
      expect(isTradingHours(nasdaq, timestamp)).toBe(false);
    });
  });

  describe('エッジケース', () => {
    it('開始時刻と終了時刻が同じ場合、false を返す', () => {
      const exchange: Exchange = {
        ...nasdaq,
        Start: '09:00',
        End: '09:00',
      };

      // 2024-01-15 (月曜日) 09:00 EST = 2024-01-15 14:00 UTC
      const sameTime = new Date('2024-01-15T14:00:00Z');
      expect(isTradingHours(exchange, sameTime)).toBe(false);
    });
  });

  describe('getLastTradingDate', () => {
    // NASDAQ (America/New_York, End: 20:00) での検証
    // EST = UTC-5 (1月は夏時間なし)

    it('平日かつ取引終了後 → 当日の日付を返す', () => {
      // 2024-01-17 (水曜日) 22:00 EST = 2024-01-18 03:00 UTC
      // 22:00 >= End(20:00) → 今日が最新取引日
      const now = Date.UTC(2024, 0, 18, 3, 0, 0);
      expect(getLastTradingDate(nasdaq, now)).toBe('2024-01-17');
    });

    it('平日かつ取引開始前 → 前日の平日を返す', () => {
      // 2024-01-17 (水曜日) 07:00 EST = 2024-01-17 12:00 UTC
      // 07:00 < End(20:00) → 前日 = 火曜 2024-01-16
      const now = Date.UTC(2024, 0, 17, 12, 0, 0);
      expect(getLastTradingDate(nasdaq, now)).toBe('2024-01-16');
    });

    it('月曜かつ取引開始前 → 前週金曜を返す', () => {
      // 2024-01-15 (月曜日) 07:00 EST = 2024-01-15 12:00 UTC
      // 07:00 < End(20:00) → 前日(日) → 前々日(土) → 前々々日(金) = 2024-01-12
      const now = Date.UTC(2024, 0, 15, 12, 0, 0);
      expect(getLastTradingDate(nasdaq, now)).toBe('2024-01-12');
    });

    it('土曜日 → 前週金曜を返す', () => {
      // 2024-01-20 (土曜日) 12:00 EST = 2024-01-20 17:00 UTC
      const now = Date.UTC(2024, 0, 20, 17, 0, 0);
      expect(getLastTradingDate(nasdaq, now)).toBe('2024-01-19');
    });

    it('日曜日 → 前週金曜を返す', () => {
      // 2024-01-21 (日曜日) 12:00 EST = 2024-01-21 17:00 UTC
      const now = Date.UTC(2024, 0, 21, 17, 0, 0);
      expect(getLastTradingDate(nasdaq, now)).toBe('2024-01-19');
    });

    it('取引終了時刻ちょうど (End = 20:00) → 当日を返す', () => {
      // 2024-01-17 (水曜日) 20:00 EST = 2024-01-18 01:00 UTC
      // 20:00 >= End(20:00) → 今日が最新取引日
      const now = Date.UTC(2024, 0, 18, 1, 0, 0);
      expect(getLastTradingDate(nasdaq, now)).toBe('2024-01-17');
    });

    it('TSE (Asia/Tokyo) の土曜日 → 金曜を返す', () => {
      // 2024-01-13 (土曜日) 10:00 JST = 2024-01-13 01:00 UTC
      const now = Date.UTC(2024, 0, 13, 1, 0, 0);
      expect(getLastTradingDate(tse, now)).toBe('2024-01-12');
    });

    it('TSE (Asia/Tokyo) 平日かつ取引終了後 → 当日を返す', () => {
      // 2024-01-15 (月曜日) 16:00 JST = 2024-01-15 07:00 UTC
      // 16:00 >= End(15:00) → 今日が最新取引日
      const now = Date.UTC(2024, 0, 15, 7, 0, 0);
      expect(getLastTradingDate(tse, now)).toBe('2024-01-15');
    });

    it('TSE (Asia/Tokyo) 月曜かつ取引開始前 → 前週金曜を返す', () => {
      // 2024-01-15 (月曜日) 08:00 JST = 2024-01-14 23:00 UTC
      // 08:00 < End(15:00) → 前日(日) → 前々日(土) → 前々々日(金) = 2024-01-12
      const now = Date.UTC(2024, 0, 14, 23, 0, 0);
      expect(getLastTradingDate(tse, now)).toBe('2024-01-12');
    });
  });

  describe('calculateTemporaryExpireDate', () => {
    it('取引時間内は当日を返す', () => {
      // 2024-01-17 (水) 10:00 EST = 2024-01-17 15:00 UTC
      const now = Date.UTC(2024, 0, 17, 15, 0, 0);
      expect(calculateTemporaryExpireDate(nasdaq, now)).toBe('2024-01-17');
    });

    it('取引時間外（平日夜）は翌平日を返す', () => {
      // 2024-01-17 (水) 21:00 EST = 2024-01-18 02:00 UTC
      // 最新取引日: 2024-01-17 → 期限: 2024-01-18
      const now = Date.UTC(2024, 0, 18, 2, 0, 0);
      expect(calculateTemporaryExpireDate(nasdaq, now)).toBe('2024-01-18');
    });

    it('取引時間外（月曜開始前）は当週火曜ではなく当日月曜を返す', () => {
      // 2024-01-15 (月) 03:00 EST = 2024-01-15 08:00 UTC
      // 最新取引日: 前週金曜 2024-01-12 → 期限: 2024-01-15
      const now = Date.UTC(2024, 0, 15, 8, 0, 0);
      expect(calculateTemporaryExpireDate(nasdaq, now)).toBe('2024-01-15');
    });
  });

  describe('エラーハンドリング', () => {
    describe('無効なタイムゾーン', () => {
      it('無効なタイムゾーンの場合、エラーをスローする', () => {
        const invalidExchange: Exchange = {
          ...nasdaq,
          Timezone: 'Invalid/Timezone',
        };

        const currentTime = new Date('2024-01-15T14:00:00Z');
        expect(() => isTradingHours(invalidExchange, currentTime)).toThrow(
          TRADING_HOURS_ERROR_MESSAGES.INVALID_TIMEZONE
        );
      });
    });

    describe('無効な時刻形式', () => {
      it('Start が無効な形式の場合、エラーをスローする', () => {
        const invalidExchange: Exchange = {
          ...nasdaq,
          Start: '9:00', // 1桁の時間
        };

        const currentTime = new Date('2024-01-15T14:00:00Z');
        expect(() => isTradingHours(invalidExchange, currentTime)).toThrow(
          TRADING_HOURS_ERROR_MESSAGES.INVALID_TIME_FORMAT
        );
      });

      it('End が無効な形式の場合、エラーをスローする', () => {
        const invalidExchange: Exchange = {
          ...nasdaq,
          End: '25:00', // 24時間を超える
        };

        const currentTime = new Date('2024-01-15T14:00:00Z');
        expect(() => isTradingHours(invalidExchange, currentTime)).toThrow(
          TRADING_HOURS_ERROR_MESSAGES.INVALID_TIME_FORMAT
        );
      });

      it('Start が HH:MM 形式でない場合、エラーをスローする', () => {
        const invalidExchange: Exchange = {
          ...nasdaq,
          Start: 'invalid',
        };

        const currentTime = new Date('2024-01-15T14:00:00Z');
        expect(() => isTradingHours(invalidExchange, currentTime)).toThrow(
          TRADING_HOURS_ERROR_MESSAGES.INVALID_TIME_FORMAT
        );
      });
    });

    describe('無効な現在時刻', () => {
      it('NaN の timestamp の場合、エラーをスローする', () => {
        expect(() => isTradingHours(nasdaq, NaN)).toThrow(
          TRADING_HOURS_ERROR_MESSAGES.INVALID_CURRENT_TIME
        );
      });

      it('負の timestamp の場合、エラーをスローする', () => {
        expect(() => isTradingHours(nasdaq, -1)).toThrow(
          TRADING_HOURS_ERROR_MESSAGES.INVALID_CURRENT_TIME
        );
      });

      it('無効な Date オブジェクトの場合、エラーをスローする', () => {
        const invalidDate = new Date('invalid');
        expect(() => isTradingHours(nasdaq, invalidDate)).toThrow(
          TRADING_HOURS_ERROR_MESSAGES.INVALID_CURRENT_TIME
        );
      });

      it('数値でも Date でもない場合、エラーをスローする', () => {
        expect(() => isTradingHours(nasdaq, '2024-01-15' as unknown as number)).toThrow(
          TRADING_HOURS_ERROR_MESSAGES.INVALID_CURRENT_TIME
        );
      });
    });
  });
});
