import { tokenize } from '../src/tokenize';

describe('tokenize', () => {
  it('日本語を単語に分ける', () => {
    expect(tokenize('鮮度確認')).toEqual(['鮮度', '確認']);
    expect(tokenize('勉強バッチ')).toEqual(['勉強', 'バッチ']);
  });

  it('記号と空白を捨て、英字は小文字にする', () => {
    expect(tokenize('Web fact (acquire)')).toEqual(['web', 'fact', 'acquire']);
  });

  it('Segmenter を使い回す', () => {
    tokenize('a');
    const holder = globalThis as unknown as { __jaSegmenter?: Intl.Segmenter };
    const first = holder.__jaSegmenter;
    tokenize('b');
    expect(holder.__jaSegmenter).toBe(first);
  });
});
