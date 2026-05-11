import { describe, it, expect } from '@jest/globals';
import { formatFileSize } from '../../../src/format/file-size.js';

describe('formatFileSize', () => {
  describe('1 MB 未満は KB 単位で表示する', () => {
    it('512 KB', () => {
      expect(formatFileSize(512 * 1024)).toBe('512.0 KB');
    });

    it('1023 KB（境界値直前）', () => {
      expect(formatFileSize(1023 * 1024)).toBe('1023.0 KB');
    });

    it('小数を含むサイズも切り捨てず小数点第 1 位まで表示', () => {
      expect(formatFileSize(1.5 * 1024)).toBe('1.5 KB');
    });

    it('0 バイトは "0.0 KB"', () => {
      expect(formatFileSize(0)).toBe('0.0 KB');
    });
  });

  describe('1 MB 以上は MB 単位で表示する', () => {
    it('1 MB（境界値）', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    });

    it('50 MB', () => {
      expect(formatFileSize(50 * 1024 * 1024)).toBe('50.0 MB');
    });

    it('小数を含むサイズは小数点第 1 位に四捨五入', () => {
      expect(formatFileSize(2.75 * 1024 * 1024)).toBe('2.8 MB');
    });
  });
});
