/**
 * Unit tests for ERROR_CODES constants
 */

import { describe, it, expect } from '@jest/globals';
import { ERROR_CODES } from '../../../src/constants/error-codes.js';
import type { ErrorCode } from '../../../src/constants/error-codes.js';

describe('ERROR_CODES', () => {
  it('ERROR_CODESが定義されている', () => {
    expect(ERROR_CODES).toBeDefined();
  });

  describe('認証・認可エラー', () => {
    it('UNAUTHORIZEDが定義されている', () => {
      expect(ERROR_CODES.UNAUTHORIZED).toBe('UNAUTHORIZED');
    });

    it('FORBIDDENが定義されている', () => {
      expect(ERROR_CODES.FORBIDDEN).toBe('FORBIDDEN');
    });
  });

  describe('リクエストエラー', () => {
    it('INVALID_REQUESTが定義されている', () => {
      expect(ERROR_CODES.INVALID_REQUEST).toBe('INVALID_REQUEST');
    });

    it('VALIDATION_ERRORが定義されている', () => {
      expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    });
  });

  describe('サーバーエラー', () => {
    it('INTERNAL_ERRORが定義されている', () => {
      expect(ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });
  });

  describe('リソースエラー', () => {
    it('NOT_FOUNDが定義されている', () => {
      expect(ERROR_CODES.NOT_FOUND).toBe('NOT_FOUND');
    });

    it('ALREADY_EXISTSが定義されている', () => {
      expect(ERROR_CODES.ALREADY_EXISTS).toBe('ALREADY_EXISTS');
    });
  });

  describe('ErrorCode型', () => {
    it('ErrorCode型は正しく推論される', () => {
      const validCode: ErrorCode = 'UNAUTHORIZED';
      expect(validCode).toBe('UNAUTHORIZED');
    });

    it('ErrorCode型は全てのエラーコードを受け入れる', () => {
      const codes: ErrorCode[] = [
        'UNAUTHORIZED',
        'FORBIDDEN',
        'INVALID_REQUEST',
        'VALIDATION_ERROR',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'ALREADY_EXISTS',
      ];

      codes.forEach((code) => {
        expect(Object.values(ERROR_CODES)).toContain(code);
      });
    });
  });

  describe('定数の不変性', () => {
    it('ERROR_CODESオブジェクトは読み取り専用（型レベル）', () => {
      // TypeScript の as const により、型レベルで読み取り専用が保証される
      // 実行時の変更は可能だが、TypeScriptコンパイル時にエラーになる
      expect(Object.isFrozen(ERROR_CODES)).toBe(false); // as const は実行時の凍結ではない
    });

    it('ERROR_CODESの値は文字列リテラル', () => {
      // as const により、値が文字列リテラル型として扱われる
      type UnauthorizedType = typeof ERROR_CODES.UNAUTHORIZED;
      const value: UnauthorizedType = 'UNAUTHORIZED';
      expect(value).toBe('UNAUTHORIZED');
    });
  });

  describe('エラーコードの一覧', () => {
    it('全てのエラーコードが取得できる', () => {
      const allCodes = Object.keys(ERROR_CODES);
      expect(allCodes).toContain('UNAUTHORIZED');
      expect(allCodes).toContain('FORBIDDEN');
      expect(allCodes).toContain('INVALID_REQUEST');
      expect(allCodes).toContain('VALIDATION_ERROR');
      expect(allCodes).toContain('INTERNAL_ERROR');
      expect(allCodes).toContain('NOT_FOUND');
      expect(allCodes).toContain('ALREADY_EXISTS');
      expect(allCodes).toHaveLength(7);
    });

    it('エラーコードの値は大文字スネークケース', () => {
      Object.values(ERROR_CODES).forEach((code) => {
        expect(code).toMatch(/^[A-Z_]+$/);
      });
    });

    it('キーと値が一致する', () => {
      Object.entries(ERROR_CODES).forEach(([key, value]) => {
        expect(key).toBe(value);
      });
    });
  });
});
