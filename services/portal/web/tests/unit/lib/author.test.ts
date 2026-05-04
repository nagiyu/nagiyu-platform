import { AUTHOR, SITE } from '@/lib/author';

describe('author', () => {
  describe('AUTHOR', () => {
    it('著者情報の必須フィールドを持つ', () => {
      expect(AUTHOR.name).toBe('なぎゆー');
      expect(AUTHOR.url).toBe('https://nagiyu.com/about');
      expect(AUTHOR.sameAs).toEqual(['https://github.com/nagiyu']);
    });
  });

  describe('SITE', () => {
    it('サイト情報の必須フィールドを持つ', () => {
      expect(SITE.name).toBe('nagiyu');
      expect(SITE.url).toBe('https://nagiyu.com');
      expect(typeof SITE.description).toBe('string');
      expect(SITE.description.length).toBeGreaterThan(0);
      expect(SITE.logo).toBe('https://nagiyu.com/og-default.png');
    });
  });
});
