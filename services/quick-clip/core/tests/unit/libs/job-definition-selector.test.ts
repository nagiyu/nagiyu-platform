import { selectJobDefinition } from '../../../src/libs/job-definition-selector.js';

describe('selectJobDefinition', () => {
  describe('サイズ軸(durationSec省略時は従来挙動)', () => {
    it('1GB未満はsmallを返す', () => {
      expect(selectJobDefinition(1024 * 1024 * 1024 - 1)).toBe('small');
    });

    it('1GB以上4GB未満はlargeを返す', () => {
      expect(selectJobDefinition(1024 * 1024 * 1024)).toBe('large');
      expect(selectJobDefinition(2 * 1024 * 1024 * 1024)).toBe('large');
      expect(selectJobDefinition(4 * 1024 * 1024 * 1024 - 1)).toBe('large');
    });

    it('4GB以上はxlargeを返す', () => {
      expect(selectJobDefinition(4 * 1024 * 1024 * 1024)).toBe('xlarge');
      expect(selectJobDefinition(20 * 1024 * 1024 * 1024)).toBe('xlarge');
    });
  });

  describe('尺軸(durationSec指定時)', () => {
    const SMALL_FILE_SIZE = 100 * 1024 * 1024; // 100MiB (サイズ軸ではsmall)

    it('durationSecが未定義の場合はサイズ軸のみで判定する(昇格しない)', () => {
      expect(selectJobDefinition(SMALL_FILE_SIZE, undefined)).toBe('small');
    });

    it('90分未満はsmallのまま(サイズ軸がsmallの場合)', () => {
      expect(selectJobDefinition(SMALL_FILE_SIZE, 5399)).toBe('small');
    });

    it('90分ちょうどでlargeに昇格する境界値', () => {
      expect(selectJobDefinition(SMALL_FILE_SIZE, 5400)).toBe('large');
    });

    it('90分以上180分未満はlargeに昇格する', () => {
      expect(selectJobDefinition(SMALL_FILE_SIZE, 7200)).toBe('large');
      expect(selectJobDefinition(SMALL_FILE_SIZE, 10799)).toBe('large');
    });

    it('180分ちょうどでxlargeに昇格する境界値', () => {
      expect(selectJobDefinition(SMALL_FILE_SIZE, 10800)).toBe('xlarge');
    });

    it('180分以上はxlargeに昇格する', () => {
      expect(selectJobDefinition(SMALL_FILE_SIZE, 12000)).toBe('xlarge');
    });
  });

  describe('2軸のうち大きい方(max)が採用される', () => {
    it('小サイズ×短尺はsmallのまま', () => {
      expect(selectJobDefinition(100 * 1024 * 1024, 60)).toBe('small');
    });

    it('大サイズ×短尺でもサイズ側でlargeに昇格する', () => {
      expect(selectJobDefinition(2 * 1024 * 1024 * 1024, 60)).toBe('large');
    });

    it('大サイズ(xlarge)×短尺でもサイズ側でxlargeが維持される', () => {
      expect(selectJobDefinition(5 * 1024 * 1024 * 1024, 60)).toBe('xlarge');
    });

    it('中サイズ(large)×長尺(xlarge相当)では尺側でxlargeに昇格する', () => {
      expect(selectJobDefinition(2 * 1024 * 1024 * 1024, 12000)).toBe('xlarge');
    });
  });
});
