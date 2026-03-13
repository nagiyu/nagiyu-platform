import { urlBase64ToUint8Array } from '../../src/push';

describe('push utilities', () => {
  describe('urlBase64ToUint8Array', () => {
    it('Base64 URL 文字列を Uint8Array に変換できる', () => {
      const result = urlBase64ToUint8Array('SGVsbG8');
      expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]);
    });

    it('URL セーフ文字を含む場合でも変換できる', () => {
      const result = urlBase64ToUint8Array('-w');
      expect(Array.from(result)).toEqual([251]);
    });
  });
});
