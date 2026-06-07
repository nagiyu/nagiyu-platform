import {
  buildWebSiteJsonLd,
  buildOrganizationJsonLd,
  buildBlogPostingJsonLd,
  buildBreadcrumbJsonLd,
  buildFAQPageJsonLd,
  jsonLdScript,
} from '@/lib/jsonLd';
import type { FaqPair } from '@/lib/jsonLd';
import type { ArticleMeta } from '@/types/content';

describe('jsonLd', () => {
  describe('buildWebSiteJsonLd', () => {
    it('WebSite 型の JSON-LD を返す', () => {
      const data = buildWebSiteJsonLd();
      expect(data['@type']).toBe('WebSite');
      expect(data['@context']).toBe('https://schema.org');
      expect(data.url).toBe('https://nagiyu.com');
      expect(data.inLanguage).toBe('ja-JP');
    });
  });

  describe('buildOrganizationJsonLd', () => {
    it('Organization 型の JSON-LD を返す', () => {
      const data = buildOrganizationJsonLd();
      expect(data['@type']).toBe('Organization');
      expect(data.name).toBe('nagiyu');
      expect(data.logo).toBe('https://nagiyu.com/og-default.png');
      expect(Array.isArray(data.sameAs)).toBe(true);
    });
  });

  describe('buildBlogPostingJsonLd', () => {
    const baseArticle: ArticleMeta = {
      title: 'サンプル記事',
      description: 'サンプル説明',
      slug: 'sample-article',
      publishedAt: '2026-04-10',
      tags: ['AWS', 'Next.js'],
    };

    it('BlogPosting 型の JSON-LD を返す（updatedAt なし）', () => {
      const data = buildBlogPostingJsonLd(baseArticle);
      expect(data['@type']).toBe('BlogPosting');
      expect(data.headline).toBe(baseArticle.title);
      expect(data.datePublished).toBe('2026-04-10T00:00:00.000Z');
      expect(data.dateModified).toBe('2026-04-10T00:00:00.000Z');
      expect(data.author.name).toBe('なぎゆー');
      expect(data.keywords).toBe('AWS, Next.js');
    });

    it('updatedAt があれば dateModified に反映する', () => {
      const data = buildBlogPostingJsonLd({ ...baseArticle, updatedAt: '2026-05-01' });
      expect(data.dateModified).toBe('2026-05-01T00:00:00.000Z');
      expect(data.datePublished).toBe('2026-04-10T00:00:00.000Z');
    });

    it('author を指定すれば BlogPosting に反映される', () => {
      const data = buildBlogPostingJsonLd({ ...baseArticle, author: 'カスタム著者' });
      expect(data.author.name).toBe('カスタム著者');
    });
  });

  describe('buildBreadcrumbJsonLd', () => {
    it('BreadcrumbList の itemListElement を作る', () => {
      const data = buildBreadcrumbJsonLd([
        { name: 'ホーム', url: 'https://nagiyu.com/' },
        { name: '記事', url: 'https://nagiyu.com/tech/foo' },
      ]);
      expect(data['@type']).toBe('BreadcrumbList');
      expect(data.itemListElement).toHaveLength(2);
      expect(data.itemListElement[0].position).toBe(1);
      expect(data.itemListElement[0].name).toBe('ホーム');
      expect(data.itemListElement[1].position).toBe(2);
    });
  });

  describe('buildFAQPageJsonLd', () => {
    it('FAQPage 型の JSON-LD を返す', () => {
      const pairs: FaqPair[] = [
        { question: '質問1', answer: '回答1' },
        { question: '質問2', answer: '回答2' },
      ];
      const data = buildFAQPageJsonLd(pairs);
      expect(data['@type']).toBe('FAQPage');
      expect(data['@context']).toBe('https://schema.org');
      expect(data.mainEntity).toHaveLength(2);
    });

    it('mainEntity の各要素が Question 型を持つ', () => {
      const pairs: FaqPair[] = [
        { question: 'テスト質問', answer: 'テスト回答' },
      ];
      const data = buildFAQPageJsonLd(pairs);
      expect(data.mainEntity[0]['@type']).toBe('Question');
      expect(data.mainEntity[0].name).toBe('テスト質問');
    });

    it('acceptedAnswer が Answer 型と回答テキストを持つ', () => {
      const pairs: FaqPair[] = [
        { question: 'テスト質問', answer: 'テスト回答' },
      ];
      const data = buildFAQPageJsonLd(pairs);
      expect(data.mainEntity[0].acceptedAnswer['@type']).toBe('Answer');
      expect(data.mainEntity[0].acceptedAnswer.text).toBe('テスト回答');
    });

    it('空配列を渡すと mainEntity が空配列になる', () => {
      const data = buildFAQPageJsonLd([]);
      expect(data['@type']).toBe('FAQPage');
      expect(data.mainEntity).toEqual([]);
    });
  });

  describe('jsonLdScript', () => {
    it('JSON 文字列を返し、`<` をエスケープする', () => {
      const result = jsonLdScript({ a: '</script>' });
      expect(result).toBe('{"a":"\\u003c/script>"}');
    });

    it('通常のオブジェクトはそのまま JSON 化', () => {
      const result = jsonLdScript({ a: 'b', n: 1 });
      expect(result).toBe('{"a":"b","n":1}');
    });
  });
});
