import sitemap from '@/app/sitemap';
import { SITE_URL } from '@/lib/site';

describe('sitemap', () => {
  it('すべての URL が配信ドメインで始まる', () => {
    const entries = sitemap();

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.url.startsWith(SITE_URL)).toBe(true);
    }
  });

  it('SITE_URL は tools の配信ドメインである', () => {
    expect(SITE_URL).toBe('https://tools.nagiyu.com');
  });
});
