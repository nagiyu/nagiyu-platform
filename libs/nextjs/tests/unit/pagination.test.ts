/**
 * Pagination Helper Unit Tests
 */

import { describe, it, expect } from '@jest/globals';
import {
  parsePagination,
  createPaginatedResponse,
  PAGINATION_ERROR_CODES,
  PaginationValidationError,
} from '../../src/pagination';
import { NextRequest } from 'next/server';

describe('parsePagination', () => {
  it('デフォルト値（limit=50）を返す', () => {
    const request = new NextRequest('http://localhost/api/test');
    const result = parsePagination(request);
    expect(result).toEqual({
      limit: 50,
      cursor: undefined,
    });
  });

  it('limitパラメータをパースする', () => {
    const request = new NextRequest('http://localhost/api/test?limit=10');
    const result = parsePagination(request);
    expect(result).toEqual({
      limit: 10,
      cursor: undefined,
    });
  });

  it('lastKeyパラメータをデコードせず生の文字列のまま cursor として返す', () => {
    const encodedLastKey = Buffer.from(
      JSON.stringify({ id: '123', timestamp: 1234567890 })
    ).toString('base64');
    const request = new NextRequest(
      `http://localhost/api/test?lastKey=${encodeURIComponent(encodedLastKey)}`
    );
    const result = parsePagination(request);
    expect(result).toEqual({
      limit: 50,
      cursor: encodedLastKey,
    });
  });

  it('不正な形式の lastKey でも解釈せずそのまま cursor として返す', () => {
    const request = new NextRequest('http://localhost/api/test?lastKey=invalid-base64');
    const result = parsePagination(request);
    expect(result).toEqual({
      limit: 50,
      cursor: 'invalid-base64',
    });
  });

  it('lastKeyが空文字の場合 cursor は undefined になる', () => {
    const request = new NextRequest('http://localhost/api/test?lastKey=');
    const result = parsePagination(request);
    expect(result.cursor).toBeUndefined();
  });

  it('limitとlastKeyの両方をパースする', () => {
    const request = new NextRequest('http://localhost/api/test?limit=20&lastKey=abc');
    const result = parsePagination(request);
    expect(result).toEqual({
      limit: 20,
      cursor: 'abc',
    });
  });

  it('limitが1未満の場合エラーをスローする', () => {
    const request = new NextRequest('http://localhost/api/test?limit=0');
    expect(() => parsePagination(request)).toThrow('limit は 1 から 100 の間で指定してください');
  });

  it('limitが不正な場合、エラーコード付きでスローする', () => {
    const request = new NextRequest('http://localhost/api/test?limit=101');
    expect.assertions(2);
    try {
      parsePagination(request);
    } catch (error) {
      expect(error).toBeInstanceOf(PaginationValidationError);
      expect((error as PaginationValidationError).code).toBe(PAGINATION_ERROR_CODES.INVALID_LIMIT);
      return;
    }
    throw new Error('例外がスローされるべきでした');
  });

  it('limitが100を超える場合エラーをスローする', () => {
    const request = new NextRequest('http://localhost/api/test?limit=101');
    expect(() => parsePagination(request)).toThrow('limit は 1 から 100 の間で指定してください');
  });

  it('limitが数値でない場合エラーをスローする', () => {
    const request = new NextRequest('http://localhost/api/test?limit=abc');
    expect(() => parsePagination(request)).toThrow('limit は 1 から 100 の間で指定してください');
  });
});

describe('createPaginatedResponse', () => {
  it('lastKeyなしの場合 pagination に lastKey を含めない', async () => {
    const items = [{ id: '1' }, { id: '2' }];
    const response = createPaginatedResponse(items);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items, pagination: { count: 2 } });
  });

  it('lastKeyを再エンコードせずそのまま pagination.lastKey に入れる', async () => {
    const items = [{ id: '1' }, { id: '2' }];
    const response = createPaginatedResponse(items, 'encoded-cursor');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items,
      pagination: { count: 2, lastKey: 'encoded-cursor' },
    });
  });

  it('空の配列でレスポンスを作成する', async () => {
    const response = createPaginatedResponse<string>([]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], pagination: { count: 0 } });
  });
});
