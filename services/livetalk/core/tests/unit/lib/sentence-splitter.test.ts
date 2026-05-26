import { SentenceBuffer } from '../../../src/lib/sentence-splitter.js';

describe('SentenceBuffer', () => {
  describe('push', () => {
    it('句点のない delta では空配列を返す', () => {
      const buf = new SentenceBuffer();
      expect(buf.push('こんにちは')).toEqual([]);
    });

    it('句点（。）で文を返す', () => {
      const buf = new SentenceBuffer();
      expect(buf.push('こんにちは。')).toEqual(['こんにちは。']);
    });

    it('感嘆符（！）で文を返す', () => {
      const buf = new SentenceBuffer();
      expect(buf.push('すごい！')).toEqual(['すごい！']);
    });

    it('疑問符（？）で文を返す', () => {
      const buf = new SentenceBuffer();
      expect(buf.push('本当？')).toEqual(['本当？']);
    });

    it('ASCII 感嘆符（!）で文を返す', () => {
      const buf = new SentenceBuffer();
      expect(buf.push('great!')).toEqual(['great!']);
    });

    it('ASCII 疑問符（?）で文を返す', () => {
      const buf = new SentenceBuffer();
      expect(buf.push('ok?')).toEqual(['ok?']);
    });

    it('複数の文を含む delta で全文を返す', () => {
      const buf = new SentenceBuffer();
      const result = buf.push('おはよう。今日もいい天気ですね。');
      expect(result).toEqual(['おはよう。', '今日もいい天気ですね。']);
    });

    it('チャンク分割でも正しく文を組み立てる', () => {
      const buf = new SentenceBuffer();
      expect(buf.push('おは')).toEqual([]);
      expect(buf.push('よう')).toEqual([]);
      expect(buf.push('。')).toEqual(['おはよう。']);
    });

    it('区切り後のテキストは次の文バッファに残る', () => {
      const buf = new SentenceBuffer();
      expect(buf.push('こんにちは。今日は')).toEqual(['こんにちは。']);
      expect(buf.flush()).toBe('今日は');
    });

    it('句点のみの delta は空文字列の文を生成しない', () => {
      const buf = new SentenceBuffer();
      const result = buf.push('。');
      expect(result).toEqual([]);
    });

    it('空文字 delta では空配列を返す', () => {
      const buf = new SentenceBuffer();
      expect(buf.push('')).toEqual([]);
    });
  });

  describe('flush', () => {
    it('バッファが空のとき空文字を返す', () => {
      const buf = new SentenceBuffer();
      expect(buf.flush()).toBe('');
    });

    it('途中テキストをそのまま返してバッファをクリアする', () => {
      const buf = new SentenceBuffer();
      buf.push('最後の文です');
      expect(buf.flush()).toBe('最後の文です');
      expect(buf.flush()).toBe(''); // クリア済み
    });

    it('前後の空白は trim される', () => {
      const buf = new SentenceBuffer();
      buf.push('  text  ');
      expect(buf.flush()).toBe('text');
    });
  });

  describe('連続利用', () => {
    it('複数の push と flush を組み合わせて動作する', () => {
      const buf = new SentenceBuffer();
      const r1 = buf.push('今日は');
      const r2 = buf.push('晴れです。明日は');
      const r3 = buf.push('雨かな？');
      const remaining = buf.flush();

      expect(r1).toEqual([]);
      expect(r2).toEqual(['今日は晴れです。']);
      expect(r3).toEqual(['明日は雨かな？']);
      expect(remaining).toBe('');
    });
  });
});
