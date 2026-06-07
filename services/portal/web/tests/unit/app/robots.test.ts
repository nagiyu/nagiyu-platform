/**
 * robots.ts のユニットテスト
 *
 * Next.js の MetadataRoute.Robots 出力内容を検証する。
 * - すべてのクローラを許可していること（AdSense クローラを含む）
 * - sitemap URL が正しく設定されていること
 * - host が正しく設定されていること
 */

import robots from '@/app/robots';

describe('robots', () => {
  const SITE_URL = 'https://nagiyu.com';

  describe('rules', () => {
    it('rules が 1 件以上返る', () => {
      const result = robots();
      const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
      expect(rules.length).toBeGreaterThanOrEqual(1);
    });

    it('全クローラ（"*"）に対するルールが存在する', () => {
      const result = robots();
      const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
      const globalRule = rules.find(
        (rule) => rule.userAgent === '*' || (Array.isArray(rule.userAgent) && rule.userAgent.includes('*'))
      );
      expect(globalRule).toBeDefined();
    });

    it('全クローラにサイト全体へのアクセスを許可している（Disallow が "/" を含まない）', () => {
      const result = robots();
      const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

      for (const rule of rules) {
        const disallow = rule.disallow;
        if (disallow === undefined) continue;

        const disallowList = Array.isArray(disallow) ? disallow : [disallow];
        // "/" を Disallow にしていないことを確認（全サイトブロックの防止）
        expect(disallowList).not.toContain('/');
      }
    });

    it('全クローラに "/" への allow が設定されている', () => {
      const result = robots();
      const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
      const globalRule = rules.find(
        (rule) => rule.userAgent === '*' || (Array.isArray(rule.userAgent) && rule.userAgent.includes('*'))
      );
      expect(globalRule).toBeDefined();
      if (!globalRule) return;

      const allow = globalRule.allow;
      const allowList = Array.isArray(allow) ? allow : allow !== undefined ? [allow] : [];
      expect(allowList).toContain('/');
    });

    it('Googlebot-Image を個別に Disallow していない（画像クロール許可）', () => {
      const result = robots();
      const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

      const googlebotImageRule = rules.find((rule) => {
        const agents = Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent];
        return agents.includes('Googlebot-Image');
      });

      if (googlebotImageRule) {
        // 存在する場合、Disallow が設定されていないか空であることを確認
        const disallow = googlebotImageRule.disallow;
        if (disallow !== undefined) {
          const disallowList = Array.isArray(disallow) ? disallow : [disallow];
          const nonEmptyDisallows = disallowList.filter((d) => d !== '');
          expect(nonEmptyDisallows).toHaveLength(0);
        }
      } else {
        // ルールが存在しない場合はデフォルトで許可されているため合格
        expect(googlebotImageRule).toBeUndefined();
      }
    });

    it('Mediapartners-Google（AdSense クローラ）を個別に Disallow していない', () => {
      const result = robots();
      const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

      const adSenseRule = rules.find((rule) => {
        const agents = Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent];
        return agents.includes('Mediapartners-Google');
      });

      if (adSenseRule) {
        // 存在する場合、Disallow が設定されていないか空であることを確認
        const disallow = adSenseRule.disallow;
        if (disallow !== undefined) {
          const disallowList = Array.isArray(disallow) ? disallow : [disallow];
          const nonEmptyDisallows = disallowList.filter((d) => d !== '');
          expect(nonEmptyDisallows).toHaveLength(0);
        }
      } else {
        // ルールが存在しない場合はデフォルトで許可（全クローラ許可ルールにより）
        expect(adSenseRule).toBeUndefined();
      }
    });
  });

  describe('sitemap', () => {
    it('sitemap URL が正しく設定されている', () => {
      const result = robots();
      expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    });
  });

  describe('host', () => {
    it('host が正しく設定されている', () => {
      const result = robots();
      expect(result.host).toBe(SITE_URL);
    });
  });

  describe('出力の形式', () => {
    it('MetadataRoute.Robots の必須プロパティをすべて持つ', () => {
      const result = robots();
      expect(result).toHaveProperty('rules');
      expect(result).toHaveProperty('sitemap');
    });
  });
});
