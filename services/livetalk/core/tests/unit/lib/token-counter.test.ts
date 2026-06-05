import {
  TiktokenCounter,
  getDefaultTokenCounter,
  resolveContextTokenLimit,
  setTokenCounterForTesting,
} from '../../../src/lib/token-counter.js';
import { DEFAULT_LLM_CONTEXT_TOKEN_LIMIT } from '../../../src/constants.js';

describe('TiktokenCounter', () => {
  it('空文字列は 0 トークン', () => {
    const c = new TiktokenCounter();
    expect(c.countTokens('')).toBe(0);
  });

  it('日本語テキストでも正の整数を返す', () => {
    const c = new TiktokenCounter();
    const n = c.countTokens('こんにちは、桃瀬ひよりです');
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThan(0);
  });

  it('countTokensForMessage はメッセージ単位オーバーヘッドを加算する', () => {
    const c = new TiktokenCounter();
    const t = c.countTokens('test');
    expect(c.countTokensForMessage('test')).toBeGreaterThanOrEqual(t + 1);
  });
});

describe('resolveContextTokenLimit', () => {
  const originalEnv = process.env.LLM_CONTEXT_TOKEN_LIMIT;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.LLM_CONTEXT_TOKEN_LIMIT;
    else process.env.LLM_CONTEXT_TOKEN_LIMIT = originalEnv;
  });

  it('明示指定があればそれを返す', () => {
    expect(resolveContextTokenLimit(1234)).toBe(1234);
  });

  it('環境変数が有効な数値ならそれを返す', () => {
    process.env.LLM_CONTEXT_TOKEN_LIMIT = '8000';
    expect(resolveContextTokenLimit()).toBe(8000);
  });

  it('環境変数が不正な値なら既定値にフォールバック', () => {
    process.env.LLM_CONTEXT_TOKEN_LIMIT = 'abc';
    expect(resolveContextTokenLimit()).toBe(DEFAULT_LLM_CONTEXT_TOKEN_LIMIT);
  });

  it('未設定なら既定値', () => {
    delete process.env.LLM_CONTEXT_TOKEN_LIMIT;
    expect(resolveContextTokenLimit()).toBe(DEFAULT_LLM_CONTEXT_TOKEN_LIMIT);
  });

  it('明示指定が 0 や負値の場合は既定値にフォールバック', () => {
    expect(resolveContextTokenLimit(0)).toBe(DEFAULT_LLM_CONTEXT_TOKEN_LIMIT);
    expect(resolveContextTokenLimit(-100)).toBe(DEFAULT_LLM_CONTEXT_TOKEN_LIMIT);
  });
});

describe('getDefaultTokenCounter', () => {
  afterEach(() => setTokenCounterForTesting(null));

  it('同じインスタンスをキャッシュして返す', () => {
    const a = getDefaultTokenCounter();
    const b = getDefaultTokenCounter();
    expect(a).toBe(b);
  });

  it('setTokenCounterForTesting で差し替え可能', () => {
    const fake = {
      countTokens: () => 1,
      countTokensForMessage: () => 1,
    };
    setTokenCounterForTesting(fake);
    expect(getDefaultTokenCounter()).toBe(fake);
  });
});
