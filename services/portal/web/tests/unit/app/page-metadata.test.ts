/**
 * 固定ページの metadata のユニットテスト
 *
 * Next.js は openGraph / twitter を layout から浅くマージするため、
 * ページ側で siteName・images などが欠けるとトップページの値や欠落を招く。
 * 各ページの metadata 単体で OGP が揃っていることを検証する。
 */

import type { Metadata } from 'next';
import { metadata as techMetadata } from '@/app/tech/page';
import { metadata as aboutMetadata } from '@/app/about/page';
import { metadata as contactMetadata } from '@/app/contact/page';
import { metadata as privacyMetadata } from '@/app/privacy/page';
import { metadata as termsMetadata } from '@/app/terms/page';

// content モジュールをモック化する（ファイルシステムアクセスを回避）
jest.mock('@/lib/content', () => ({
  getAllArticles: jest.fn(() => []),
  getCategoryLabel: jest.fn((category: string) => category),
}));

const PAGES: ReadonlyArray<{ path: string; metadata: Metadata }> = [
  { path: '/tech', metadata: techMetadata },
  { path: '/about', metadata: aboutMetadata },
  { path: '/contact', metadata: contactMetadata },
  { path: '/privacy', metadata: privacyMetadata },
  { path: '/terms', metadata: termsMetadata },
];

describe.each(PAGES)('$path の metadata', ({ path, metadata }) => {
  it('canonical がパスに対応し、openGraph.url と一致する', () => {
    expect(metadata.alternates?.canonical).toBe(`https://nagiyu.com${path}`);
    expect(metadata.openGraph?.url).toBe(metadata.alternates?.canonical);
  });

  it('openGraph.title / twitter.title がページの title と一致する', () => {
    expect(typeof metadata.title).toBe('string');
    expect(metadata.openGraph?.title).toBe(metadata.title);
    expect(metadata.twitter?.title).toBe(metadata.title);
  });

  it('openGraph.description / twitter.description がページの description と一致する', () => {
    expect(metadata.description).toBeTruthy();
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.twitter?.description).toBe(metadata.description);
  });

  it('siteName・locale・images が失われていない', () => {
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      locale: 'ja_JP',
      siteName: 'nagiyu',
    });
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({ url: '/og-default.png', width: 1200, height: 630 }),
    ]);
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      images: ['/og-default.png'],
    });
  });
});
