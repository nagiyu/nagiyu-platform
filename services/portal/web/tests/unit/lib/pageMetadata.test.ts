import { SITE } from '@/lib/author';
import { OG_DEFAULTS, buildPageMetadata } from '@/lib/pageMetadata';

describe('buildPageMetadata', () => {
  const metadata = buildPageMetadata('テストページ', 'テストページの説明', '/test');

  it('title と description をそのまま設定する', () => {
    expect(metadata.title).toBe('テストページ');
    expect(metadata.description).toBe('テストページの説明');
  });

  it('canonical をサイト URL とパスから組み立てる', () => {
    expect(metadata.alternates?.canonical).toBe(`${SITE.url}/test`);
  });

  it('openGraph に url・title・description・siteName・locale・type を設定する', () => {
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      locale: 'ja_JP',
      url: 'https://nagiyu.com/test',
      title: 'テストページ',
      description: 'テストページの説明',
      siteName: 'nagiyu',
    });
  });

  it('openGraph の title にサイト名のサフィックスを付けない', () => {
    expect(metadata.openGraph?.title).toBe('テストページ');
  });

  it('openGraph の画像に既定画像とページ名の alt を設定する', () => {
    expect(metadata.openGraph?.images).toEqual([
      {
        url: OG_DEFAULTS.imagePath,
        width: 1200,
        height: 630,
        alt: 'テストページ',
      },
    ]);
  });

  it('twitter に summary_large_image・title・description・画像を設定する', () => {
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'テストページ',
      description: 'テストページの説明',
      images: ['/og-default.png'],
    });
  });
});
