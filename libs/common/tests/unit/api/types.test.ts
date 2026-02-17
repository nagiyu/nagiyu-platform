/**
 * Unit tests for API types
 */

import { describe, it, expect } from '@jest/globals';
import type { ErrorResponse, PaginatedResponse } from '../../../src/api/types.js';
import type { ValidationResult } from '../../../src/validation/types.js';

describe('API Types', () => {
  describe('ErrorResponse', () => {
    it('ErrorResponse型が正しく定義されている', () => {
      const error: ErrorResponse = {
        error: 'INVALID_REQUEST',
        message: 'リクエストが不正です',
        details: ['フィールドAが必須です'],
      };
      expect(error).toBeDefined();
      expect(error.error).toBe('INVALID_REQUEST');
      expect(error.message).toBe('リクエストが不正です');
      expect(error.details).toHaveLength(1);
    });

    it('ErrorResponse型はdetailsが省略可能', () => {
      const error: ErrorResponse = {
        error: 'UNAUTHORIZED',
        message: 'ログインが必要です',
      };
      expect(error).toBeDefined();
      expect(error.details).toBeUndefined();
    });
  });

  describe('ValidationResult', () => {
    it('ValidationResult型が正しく定義されている（エラーあり）', () => {
      const result: ValidationResult<string> = {
        valid: false,
        errors: ['エラー1', 'エラー2'],
      };
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.data).toBeUndefined();
    });

    it('ValidationResult型が正しく定義されている（成功）', () => {
      const result: ValidationResult<string> = {
        valid: true,
        data: 'test-data',
      };
      expect(result.valid).toBe(true);
      expect(result.data).toBe('test-data');
      expect(result.errors).toBeUndefined();
    });

    it('ValidationResult型はジェネリクスで型を指定できる', () => {
      const stringResult: ValidationResult<string> = {
        valid: true,
        data: 'string',
      };
      const numberResult: ValidationResult<number> = {
        valid: true,
        data: 123,
      };
      const objectResult: ValidationResult<{ id: string }> = {
        valid: true,
        data: { id: 'test-id' },
      };

      expect(stringResult.data).toBe('string');
      expect(numberResult.data).toBe(123);
      expect(objectResult.data).toEqual({ id: 'test-id' });
    });

    it('ValidationResult型はデフォルトでunknown型', () => {
      const result: ValidationResult = {
        valid: true,
        data: 'anything',
      };
      expect(result.data).toBe('anything');
    });
  });

  describe('PaginatedResponse', () => {
    it('PaginatedResponse型が正しく定義されている', () => {
      const response: PaginatedResponse<{ id: string }> = {
        items: [{ id: '1' }, { id: '2' }],
        pagination: {
          count: 2,
          lastKey: 'base64encodedkey',
        },
      };
      expect(response.items).toHaveLength(2);
      expect(response.pagination.count).toBe(2);
      expect(response.pagination.lastKey).toBe('base64encodedkey');
    });

    it('PaginatedResponse型のlastKeyは省略可能', () => {
      const response: PaginatedResponse<{ id: string }> = {
        items: [{ id: '1' }],
        pagination: {
          count: 1,
        },
      };
      expect(response.items).toHaveLength(1);
      expect(response.pagination.count).toBe(1);
      expect(response.pagination.lastKey).toBeUndefined();
    });

    it('PaginatedResponse型は空配列も扱える', () => {
      const response: PaginatedResponse<{ id: string }> = {
        items: [],
        pagination: {
          count: 0,
        },
      };
      expect(response.items).toHaveLength(0);
      expect(response.pagination.count).toBe(0);
    });

    it('PaginatedResponse型はジェネリクスで型を指定できる', () => {
      const stringResponse: PaginatedResponse<string> = {
        items: ['a', 'b', 'c'],
        pagination: {
          count: 3,
        },
      };
      const numberResponse: PaginatedResponse<number> = {
        items: [1, 2, 3],
        pagination: {
          count: 3,
        },
      };

      expect(stringResponse.items).toEqual(['a', 'b', 'c']);
      expect(numberResponse.items).toEqual([1, 2, 3]);
    });
  });

  describe('Type Integration', () => {
    it('ValidationResultとPaginatedResponseを組み合わせて使用できる', () => {
      type User = { id: string; name: string };
      const result: ValidationResult<PaginatedResponse<User>> = {
        valid: true,
        data: {
          items: [
            { id: '1', name: 'User 1' },
            { id: '2', name: 'User 2' },
          ],
          pagination: {
            count: 2,
          },
        },
      };

      expect(result.valid).toBe(true);
      expect(result.data?.items).toHaveLength(2);
      expect(result.data?.pagination.count).toBe(2);
    });
  });
});
