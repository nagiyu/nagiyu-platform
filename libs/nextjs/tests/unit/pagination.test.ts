/**
 * Pagination Helper Unit Tests
 */

import { describe, it, expect } from '@jest/globals';
import { parsePagination, createPaginatedResponse } from '../../src/pagination';
import { NextRequest } from 'next/server';

describe('parsePagination', () => {
  it('デフォルト値（limit=50）を返す', () => {
    const request = new NextRequest('http://localhost/api/test');
    const result = parsePagination(request);
    expect(result).toEqual({
      limit: 50,
      lastKey: undefined,
    });
  });

  it('limitパラメータをパースする', () => {
    const request = new NextRequest('http://localhost/api/test?limit=10');
    const result = parsePagination(request);
    expect(result).toEqual({
      limit: 10,
      lastKey: undefined,
    });
  });

  it('lastKeyパラメータをデコードする', () => {
    const lastKey = { id: '123', timestamp: 1234567890 };
    const encodedLastKey = Buffer.from(JSON.stringify(lastKey)).toString('base64');
    const request = new NextRequest(`http://localhost/api/test?lastKey=${encodedLastKey}`);
    const result = parsePagination(request);
    expect(result).toEqual({
      limit: 50,
      lastKey,
    });
  });

  it('limitとlastKeyの両方をパースする', () => {
    const lastKey = { id: '456' };
    const encodedLastKey = Buffer.from(JSON.stringify(lastKey)).toString('base64');
    const request = new NextRequest(`http://localhost/api/test?limit=20&lastKey=${encodedLastKey}`);
    const result = parsePagination(request);
    expect(result).toEqual({
      limit: 20,
      lastKey,
    });
  });

  it('limitが1未満の場合エラーをスローする', () => {
    const request = new NextRequest('http://localhost/api/test?limit=0');
    expect(() => parsePagination(request)).toThrow('limit は 1 から 100 の間で指定してください');
  });

  it('limitが100を超える場合エラーをスローする', () => {
    const request = new NextRequest('http://localhost/api/test?limit=101');
    expect(() => parsePagination(request)).toThrow('limit は 1 から 100 の間で指定してください');
  });

  it('limitが数値でない場合エラーをスローする', () => {
    const request = new NextRequest('http://localhost/api/test?limit=abc');
    expect(() => parsePagination(request)).toThrow('limit は 1 から 100 の間で指定してください');
  });

  it('無効なlastKeyは無視される', () => {
    const request = new NextRequest('http://localhost/api/test?lastKey=invalid-base64');
    const result = parsePagination(request);
    expect(result).toEqual({
      limit: 50,
      lastKey: undefined,
    });
  });
});

describe('createPaginatedResponse', () => {
  it('lastKeyなしでレスポンスを作成する', () => {
    const items = [{ id: '1' }, { id: '2' }];
    const response = createPaginatedResponse(items);
    expect(response.status).toBe(200);
  });

  it('lastKeyありでレスポンスを作成する', () => {
    const items = [{ id: '1' }, { id: '2' }];
    const lastKey = { id: '2', timestamp: 1234567890 };
    const response = createPaginatedResponse(items, lastKey);
    expect(response.status).toBe(200);
  });

  it('空の配列でレスポンスを作成する', () => {
    const items: string[] = [];
    const response = createPaginatedResponse(items);
    expect(response.status).toBe(200);
  });
});
