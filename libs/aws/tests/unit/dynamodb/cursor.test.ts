import { describe, it, expect } from '@jest/globals';
import { encodeCursor, decodeCursor } from '../../../src/dynamodb/cursor.js';

describe('cursor helpers', () => {
  describe('encodeCursor', () => {
    it('lastEvaluatedKey を base64 文字列に変換する', () => {
      const key = { pk: 'user#123', sk: 'item#456' };
      const cursor = encodeCursor(key);

      expect(cursor).toBe(Buffer.from(JSON.stringify(key)).toString('base64'));
    });

    it('undefined を渡すと undefined を返す', () => {
      expect(encodeCursor(undefined)).toBeUndefined();
    });

    it('ネストされたオブジェクトをエンコードできる', () => {
      const key = { pk: { S: 'user#123' }, sk: { S: 'item#456' } };
      const cursor = encodeCursor(key);

      expect(cursor).toBeTruthy();
      expect(typeof cursor).toBe('string');
    });
  });

  describe('decodeCursor', () => {
    it('base64 文字列を lastEvaluatedKey に戻す', () => {
      const key = { pk: 'user#123', sk: 'item#456' };
      const cursor = Buffer.from(JSON.stringify(key)).toString('base64');

      expect(decodeCursor(cursor)).toEqual(key);
    });

    it('undefined を渡すと undefined を返す', () => {
      expect(decodeCursor(undefined)).toBeUndefined();
    });

    it('空文字列を渡すと undefined を返す', () => {
      expect(decodeCursor('')).toBeUndefined();
    });

    it('不正な base64 は undefined を返す（例外を投げない）', () => {
      expect(decodeCursor('!!!invalid!!!')).toBeUndefined();
    });

    it('base64 として有効だが JSON として不正な値は undefined を返す', () => {
      const notJson = Buffer.from('not-a-json').toString('base64');

      expect(decodeCursor(notJson)).toBeUndefined();
    });
  });

  describe('encode → decode のラウンドトリップ', () => {
    it('エンコードしてデコードすると元の key に戻る', () => {
      const key = { pk: 'user#123', sk: 'item#456', extra: 42 };
      const cursor = encodeCursor(key);
      const decoded = decodeCursor(cursor);

      expect(decoded).toEqual(key);
    });
  });
});
