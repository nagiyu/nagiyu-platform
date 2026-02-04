/**
 * タイムスタンプ互換性テスト
 *
 * レガシーデータ（文字列形式のタイムスタンプ）が正しく処理されることを確認
 */

import { validateTimestampField } from '../../../src/dynamodb/validators.js';

describe('Timestamp Backward Compatibility', () => {
  describe('Real-world legacy data scenarios', () => {
    it('should handle CloudWatch log format timestamp', () => {
      // CloudWatch ログのタイムスタンプ形式（実際のエラーログから）
      const cloudWatchTimestamp = '2026-02-04T12:03:28.664+09:00';
      const result = validateTimestampField(cloudWatchTimestamp, 'CreatedAt');

      // 結果が数値であることを確認
      expect(typeof result).toBe('number');
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBeGreaterThan(0);

      // 実際のタイムスタンプに変換できることを確認
      const date = new Date(result);
      expect(date.getUTCFullYear()).toBe(2026);
      expect(date.getUTCMonth()).toBe(1); // 0-indexed, so 1 = February
      expect(date.getUTCDate()).toBe(4);
    });

    it('should handle UTC ISO timestamp', () => {
      const isoTimestamp = '2026-02-04T03:03:28.664Z';
      const result = validateTimestampField(isoTimestamp, 'CreatedAt');

      expect(typeof result).toBe('number');
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBeGreaterThan(0);
    });

    it('should handle numeric timestamp (current format)', () => {
      const numericTimestamp = Date.now();
      const result = validateTimestampField(numericTimestamp, 'CreatedAt');

      // 数値形式は変換なしでそのまま返される
      expect(result).toBe(numericTimestamp);
    });

    it('should convert string and numeric to same value', () => {
      const timestamp = 1738645408664;
      const isoString = new Date(timestamp).toISOString();

      const fromNumber = validateTimestampField(timestamp, 'CreatedAt');
      const fromString = validateTimestampField(isoString, 'CreatedAt');

      // 両方とも同じタイムスタンプ値になることを確認
      expect(fromNumber).toBe(fromString);
    });
  });

  describe('DynamoDB item scenarios', () => {
    it('should handle DynamoDB item with string CreatedAt', () => {
      // レガシーデータ: CreatedAt が文字列で保存されている場合
      const legacyItem = {
        PK: 'VIDEO#sm12345',
        SK: 'VIDEO#sm12345',
        videoId: 'sm12345',
        title: 'テスト動画',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:30',
        CreatedAt: '2026-02-04T12:03:28.664+09:00', // 文字列形式
      };

      const createdAt = validateTimestampField(legacyItem.CreatedAt, 'CreatedAt');

      expect(typeof createdAt).toBe('number');
      expect(createdAt).toBeGreaterThan(0);
    });

    it('should handle DynamoDB item with numeric CreatedAt', () => {
      // 現在のデータ: CreatedAt が数値で保存されている場合
      const currentItem = {
        PK: 'VIDEO#sm12345',
        SK: 'VIDEO#sm12345',
        videoId: 'sm12345',
        title: 'テスト動画',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:30',
        CreatedAt: 1738645408664, // 数値形式
      };

      const createdAt = validateTimestampField(currentItem.CreatedAt, 'CreatedAt');

      expect(createdAt).toBe(currentItem.CreatedAt);
    });
  });
});
