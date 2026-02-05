/**
 * Unit tests for HTTP_STATUS constants
 */

import { describe, it, expect } from '@jest/globals';
import { HTTP_STATUS } from '../../../src/constants/http-status.js';

describe('HTTP_STATUS', () => {
  it('HTTP_STATUSが定義されている', () => {
    expect(HTTP_STATUS).toBeDefined();
  });

  describe('成功系ステータスコード', () => {
    it('OK (200) が定義されている', () => {
      expect(HTTP_STATUS.OK).toBe(200);
    });

    it('CREATED (201) が定義されている', () => {
      expect(HTTP_STATUS.CREATED).toBe(201);
    });
  });

  describe('クライアントエラー系ステータスコード', () => {
    it('BAD_REQUEST (400) が定義されている', () => {
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
    });

    it('UNAUTHORIZED (401) が定義されている', () => {
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
    });

    it('FORBIDDEN (403) が定義されている', () => {
      expect(HTTP_STATUS.FORBIDDEN).toBe(403);
    });

    it('NOT_FOUND (404) が定義されている', () => {
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
    });
  });

  describe('サーバーエラー系ステータスコード', () => {
    it('INTERNAL_SERVER_ERROR (500) が定義されている', () => {
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
    });
  });

  describe('定数の不変性', () => {
    it('HTTP_STATUSオブジェクトは読み取り専用（型レベル）', () => {
      // TypeScript の as const により、型レベルで読み取り専用が保証される
      // 実行時の変更は可能だが、TypeScriptコンパイル時にエラーになる
      expect(Object.isFrozen(HTTP_STATUS)).toBe(false); // as const は実行時の凍結ではない
    });

    it('HTTP_STATUSの値は数値リテラル', () => {
      // as const により、値が数値リテラル型として扱われる
      type OkType = typeof HTTP_STATUS.OK;
      const value: OkType = 200;
      expect(value).toBe(200);
    });
  });

  describe('ステータスコードの一覧', () => {
    it('全てのステータスコードが取得できる', () => {
      const allStatus = Object.keys(HTTP_STATUS);
      expect(allStatus).toContain('OK');
      expect(allStatus).toContain('CREATED');
      expect(allStatus).toContain('BAD_REQUEST');
      expect(allStatus).toContain('UNAUTHORIZED');
      expect(allStatus).toContain('FORBIDDEN');
      expect(allStatus).toContain('NOT_FOUND');
      expect(allStatus).toContain('INTERNAL_SERVER_ERROR');
      expect(allStatus).toHaveLength(7);
    });

    it('全ての値が有効なHTTPステータスコード範囲', () => {
      Object.values(HTTP_STATUS).forEach((status) => {
        expect(status).toBeGreaterThanOrEqual(100);
        expect(status).toBeLessThan(600);
      });
    });

    it('キー名は大文字スネークケース', () => {
      Object.keys(HTTP_STATUS).forEach((key) => {
        expect(key).toMatch(/^[A-Z_]+$/);
      });
    });
  });

  describe('ステータスコードの分類', () => {
    it('2xxステータスコードが含まれる', () => {
      const successCodes = Object.values(HTTP_STATUS).filter(
        (code) => code >= 200 && code < 300
      );
      expect(successCodes).toContain(200); // OK
      expect(successCodes).toContain(201); // CREATED
    });

    it('4xxステータスコードが含まれる', () => {
      const clientErrorCodes = Object.values(HTTP_STATUS).filter(
        (code) => code >= 400 && code < 500
      );
      expect(clientErrorCodes).toContain(400); // BAD_REQUEST
      expect(clientErrorCodes).toContain(401); // UNAUTHORIZED
      expect(clientErrorCodes).toContain(403); // FORBIDDEN
      expect(clientErrorCodes).toContain(404); // NOT_FOUND
    });

    it('5xxステータスコードが含まれる', () => {
      const serverErrorCodes = Object.values(HTTP_STATUS).filter((code) => code >= 500);
      expect(serverErrorCodes).toContain(500); // INTERNAL_SERVER_ERROR
    });
  });
});
