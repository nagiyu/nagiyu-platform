import type { ArticleMeta } from '@/types/content';
import { AUTHOR, SITE } from './author';

type BreadcrumbItem = {
  name: string;
  url: string;
};

export function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    inLanguage: 'ja-JP',
  };
}

export function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
    logo: SITE.logo,
    sameAs: AUTHOR.sameAs,
  };
}

export function buildBlogPostingJsonLd(article: ArticleMeta) {
  const articleUrl = `${SITE.url}/tech/${article.slug}`;
  const datePublished = new Date(article.publishedAt).toISOString();
  const dateModified = article.updatedAt
    ? new Date(article.updatedAt).toISOString()
    : datePublished;

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': articleUrl,
    },
    headline: article.title,
    description: article.description,
    image: SITE.logo,
    datePublished,
    dateModified,
    author: {
      '@type': 'Person',
      name: article.author ?? AUTHOR.name,
      url: AUTHOR.url,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      logo: {
        '@type': 'ImageObject',
        url: SITE.logo,
      },
    },
    keywords: article.tags.join(', '),
    inLanguage: 'ja-JP',
  };
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** FAQ の Q&A ペア */
export type FaqPair = {
  question: string;
  answer: string;
};

/**
 * FAQPage 型の JSON-LD を生成する
 * @param qaPairs - Q&A ペアの配列
 */
export function buildFAQPageJsonLd(qaPairs: FaqPair[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qaPairs.map((pair) => ({
      '@type': 'Question',
      name: pair.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: pair.answer,
      },
    })),
  };
}

export function jsonLdScript(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
