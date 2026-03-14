import { decodeUrl, encodeUrl, ERROR_MESSAGES } from '@/lib/url-encoder';

describe('url-encoder', () => {
  describe('encodeUrl', () => {
    it('通常の文字列をURLエンコードできる', () => {
      expect(encodeUrl('nagiyu platform')).toBe('nagiyu%20platform');
    });

    it('日本語を含む文字列をURLエンコードできる', () => {
      expect(encodeUrl('こんにちは🌟')).toBe('%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF%F0%9F%8C%9F');
    });
  });

  describe('decodeUrl', () => {
    it('URLエンコード文字列を元の文字列に戻せる', () => {
      expect(decodeUrl('nagiyu%20platform')).toBe('nagiyu platform');
    });

    it('日本語を含むURLエンコード文字列をデコードできる', () => {
      expect(decodeUrl('%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF%F0%9F%8C%9F')).toBe(
        'こんにちは🌟'
      );
    });

    it('不正なURLエンコード文字列をデコードするとエラーを返す', () => {
      expect(() => decodeUrl('%')).toThrow(ERROR_MESSAGES.DECODE_FAILED);
    });
  });
});
