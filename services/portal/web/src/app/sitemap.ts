import type { MetadataRoute } from 'next';
import { getAllArticles, getAllServiceSlugs } from '@/lib/content';

const SITE_URL = 'https://nagiyu.com';

const SERVICE_DOC_PATHS = ['', '/guide', '/faq'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/services`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/tech`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
  ];

  const serviceEntries: MetadataRoute.Sitemap = getAllServiceSlugs().flatMap((slug) =>
    SERVICE_DOC_PATHS.map((path) => ({
      url: `${SITE_URL}/services/${slug}${path}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }))
  );

  const articleEntries: MetadataRoute.Sitemap = getAllArticles().map((article) => ({
    url: `${SITE_URL}/tech/${article.slug}`,
    lastModified: article.updatedAt ? new Date(article.updatedAt) : new Date(article.publishedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [...staticEntries, ...serviceEntries, ...articleEntries];
}
