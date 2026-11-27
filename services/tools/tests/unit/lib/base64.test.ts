import { decodeBase64, encodeBase64, ERROR_MESSAGES } from '@/lib/base64';

describe('base64', () => {
  describe('encodeBase64', () => {
    it('通常の文字列をBase64に変換できる', () => {
      expect(encodeBase64('nagiyu')).toBe('bmFnaXl1');
    });

    it('日本語を含む文字列をBase64に変換できる', () => {
      expect(encodeBase64('こんにちは🌟')).toBe('44GT44KT44Gr44Gh44Gv8J+Mnw==');
    });
  });

  describe('空白だけの入力', () => {
    it('エンコードでは空白をそのまま変換する', () => {
      expect(encodeBase64(' \n')).toBe('IAo=');
    });

    it('デコードでは前後の空白を除くので空文字になる', () => {
      expect(decodeBase64('  \n')).toBe('');
    });
  });

  describe('decodeBase64', () => {
    it('Base64文字列を元のテキストに戻せる', () => {
      expect(decodeBase64('bmFnaXl1')).toBe('nagiyu');
    });

    it('日本語を含むBase64文字列をデコードできる', () => {
      expect(decodeBase64('44GT44KT44Gr44Gh44Gv8J+Mnw==')).toBe('こんにちは🌟');
    });

    it('不正なBase64文字列をデコードするとエラーを返す', () => {
      expect(() => decodeBase64('!not-base64!')).toThrow(ERROR_MESSAGES.DECODE_FAILED);
    });
  });
});
