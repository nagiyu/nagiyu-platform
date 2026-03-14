import { webcrypto } from 'node:crypto';
import { generateHash, ERROR_MESSAGES } from '@/lib/hash';

describe('hash', () => {
  beforeAll(() => {
    if (!globalThis.crypto?.subtle) {
      Object.defineProperty(globalThis, 'crypto', {
        value: webcrypto,
        configurable: true,
      });
    }
  });

  describe('generateHash', () => {
    it('SHA-256 のハッシュ値を16進文字列で生成できる', async () => {
      await expect(generateHash('nagiyu', 'SHA-256')).resolves.toBe(
        'efc6bf964f6d2b32c09c597c5f6009f7326d369496d65e91fad3ab1106a69c18'
      );
    });

    it('SHA-512 のハッシュ値を16進文字列で生成できる', async () => {
      await expect(generateHash('nagiyu', 'SHA-512')).resolves.toBe(
        'cae32f66ad8902f7e1f5b625ea66787e9fd51b9c0390c5eca79a518e3fa8927a764871773bcfb445cad654df35df17d88497bd3c9c1ff31463e1cdb451446455'
      );
    });

    it('日本語を含む文字列でもハッシュ値を生成できる', async () => {
      await expect(generateHash('こんにちは🌟', 'SHA-256')).resolves.toBe(
        '731ea015bdeb13813dfd999ad72150ed41b0cfb18b82adf22adb3dc0d4eb3423'
      );
    });

    it('Web Crypto API が利用できない場合はエラーを返す', async () => {
      const originalCrypto = globalThis.crypto;

      try {
        Object.defineProperty(globalThis, 'crypto', {
          value: undefined,
          configurable: true,
        });

        await expect(generateHash('nagiyu', 'SHA-256')).rejects.toThrow(
          ERROR_MESSAGES.HASH_FAILED
        );
      } finally {
        Object.defineProperty(globalThis, 'crypto', {
          value: originalCrypto,
          configurable: true,
        });
      }
    });
  });
});
