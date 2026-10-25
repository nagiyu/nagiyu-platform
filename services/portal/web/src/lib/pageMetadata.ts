import type { Metadata } from 'next';
import { SITE } from '@/lib/author';

/** OGP・Twitter Card で全ページ共通の値。layout と固定ページで同じ出力にするため一箇所に置く。 */
export const OG_DEFAULTS = {
  locale: 'ja_JP',
  imagePath: '/og-default.png',
  imageWidth: 1200,
  imageHeight: 630,
} as const;

/**
 * 固定ページ用のメタデータを組み立てる。
 *
 * Next.js はページで openGraph / twitter を書くと layout の同キーを丸ごと置き換える（浅いマージ）ため、
 * title と url だけ書くと siteName・locale・images が消える。そのためここで全項目を揃えて返す。
 * OGP のタイトルにはサイト名のサフィックスを付けず、ページ名のみとする。
 *
 * @param title ページ名
 * @param description ページの説明文
 * @param path 先頭が `/` のページパス（例: `/about`）
 */
export function buildPageMetadata(title: string, description: string, path: string): Metadata {
  const url = `${SITE.url}${path}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: OG_DEFAULTS.locale,
      url,
      title,
      description,
      siteName: SITE.name,
      images: [
        {
          url: OG_DEFAULTS.imagePath,
          width: OG_DEFAULTS.imageWidth,
          height: OG_DEFAULTS.imageHeight,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_DEFAULTS.imagePath],
    },
  };
}
