/**
 * Stock Tracker Core - Trading Hours Checker Service Unit Tests
 *
 * 取引時間外判定ロジックのユニットテスト
 */

import {
  isTradingHours,
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
