import { requireEnv } from '../../../src/validation/require-env.js';

describe('requireEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('正常系', () => {
    it('指定したキーの値を返す', () => {
      process.env.MY_KEY = 'my-value';
      const result = requireEnv(['MY_KEY']);
      expect(result).toEqual({ MY_KEY: 'my-value' });
    });

    it('複数キーをまとめて取得できる', () => {
      process.env.KEY_A = 'value-a';
      process.env.KEY_B = 'value-b';
      const result = requireEnv(['KEY_A', 'KEY_B']);
      expect(result).toEqual({ KEY_A: 'value-a', KEY_B: 'value-b' });
    });

    it('前後の空白をトリムした値を返す', () => {
      process.env.KEY_SPACE = '  trimmed  ';
      const result = requireEnv(['KEY_SPACE']);
      expect(result).toEqual({ KEY_SPACE: 'trimmed' });
    });

    it('空配列を渡したとき空オブジェクトを返す', () => {
      const result = requireEnv([]);
      expect(result).toEqual({});
    });
  });

  describe('異常系', () => {
    it('未設定のキーがあるとき指定のエラーメッセージでスローする', () => {
      delete process.env.MISSING_KEY;
      expect(() => requireEnv(['MISSING_KEY'])).toThrow(
        '必要な環境変数が設定されていません: MISSING_KEY'
      );
    });

    it('空文字列も未設定とみなす', () => {
      process.env.EMPTY_KEY = '';
      expect(() => requireEnv(['EMPTY_KEY'])).toThrow(
        '必要な環境変数が設定されていません: EMPTY_KEY'
      );
    });

    it('空白のみの文字列も未設定とみなす', () => {
      process.env.WHITESPACE_KEY = '   ';
      expect(() => requireEnv(['WHITESPACE_KEY'])).toThrow(
        '必要な環境変数が設定されていません: WHITESPACE_KEY'
      );
    });

    it('複数の不足キーをまとめてエラーに列挙する', () => {
      delete process.env.KEY_X;
      delete process.env.KEY_Y;
      expect(() => requireEnv(['KEY_X', 'KEY_Y'])).toThrow(
        '必要な環境変数が設定されていません: KEY_X, KEY_Y'
      );
    });

    it('一部が設定済みでも不足キーのみエラーに列挙する', () => {
      process.env.KEY_OK = 'value';
      delete process.env.KEY_NG;
      expect(() => requireEnv(['KEY_OK', 'KEY_NG'])).toThrow(
        '必要な環境変数が設定されていません: KEY_NG'
      );
    });
  });
});
