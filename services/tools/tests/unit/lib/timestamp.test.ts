import {
  convertDateTimeToUnixTimestamp,
  convertUnixMillisecondsToDateTime,
  convertUnixSecondsToDateTime,
  ERROR_MESSAGES,
  STOCK_TRACKER_TIMEZONE_OPTIONS,
} from '@/lib/timestamp';

describe('timestamp', () => {
  describe('convertUnixSecondsToDateTime', () => {
    it('Unix秒を指定タイムゾーンの日時に変換できる', () => {
      const result = convertUnixSecondsToDateTime('0', 'Asia/Tokyo');

      expect(result.unixSeconds).toBe(0);
      expect(result.unixMilliseconds).toBe(0);
      expect(result.dateTimeInTimeZone).toBe('1970-01-01 09:00:00');
      expect(result.isoUtc).toBe('1970-01-01T00:00:00.000Z');
    });

    it('不正なUnix秒を入力した場合はエラーになる', () => {
      expect(() => convertUnixSecondsToDateTime('abc', 'Asia/Tokyo')).toThrow(
        ERROR_MESSAGES.INVALID_UNIX_TIMESTAMP
      );
    });
  });

  describe('convertUnixMillisecondsToDateTime', () => {
    it('Unixミリ秒を指定タイムゾーンの日時に変換できる', () => {
      const result = convertUnixMillisecondsToDateTime(1700000000000, 'Asia/Tokyo');

      expect(result.unixSeconds).toBe(1700000000);
      expect(result.unixMilliseconds).toBe(1700000000000);
      expect(result.dateTimeInTimeZone).toBe('2023-11-15 07:13:20');
      expect(result.isoUtc).toBe('2023-11-14T22:13:20.000Z');
    });
  });

  describe('convertDateTimeToUnixTimestamp', () => {
    it('日時文字列をUnixタイムスタンプに変換できる', () => {
      const result = convertDateTimeToUnixTimestamp('1970-01-01T09:00:00', 'Asia/Tokyo');

      expect(result.unixSeconds).toBe(0);
      expect(result.unixMilliseconds).toBe(0);
      expect(result.isoUtc).toBe('1970-01-01T00:00:00.000Z');
    });

    it('Stock Trackerで利用するAmerica/New_Yorkの日時を変換できる', () => {
      const result = convertDateTimeToUnixTimestamp('2024-01-15T09:30:00', 'America/New_York');

      expect(result.unixMilliseconds).toBe(1705329000000);
      expect(result.unixSeconds).toBe(1705329000);
      expect(result.isoUtc).toBe('2024-01-15T14:30:00.000Z');
    });

    it('不正な日時形式を入力した場合はエラーになる', () => {
      expect(() => convertDateTimeToUnixTimestamp('2024/01/15 09:30:00', 'Asia/Tokyo')).toThrow(
        ERROR_MESSAGES.INVALID_DATETIME
      );
    });

    it('不正なタイムゾーンを入力した場合はエラーになる', () => {
      expect(() => convertDateTimeToUnixTimestamp('2024-01-15T09:30:00', 'Asia/Invalid')).toThrow(
        ERROR_MESSAGES.INVALID_TIMEZONE
      );
    });
  });

  it('Stock Tracker由来のタイムゾーン選択肢を保持している', () => {
    expect(STOCK_TRACKER_TIMEZONE_OPTIONS).toContainEqual({
      value: 'America/New_York',
      label: 'America/New_York (NYSE, NASDAQ)',
    });
    expect(STOCK_TRACKER_TIMEZONE_OPTIONS).toContainEqual({
      value: 'Asia/Tokyo',
      label: 'Asia/Tokyo (TSE)',
    });
  });
});
