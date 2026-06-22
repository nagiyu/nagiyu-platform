import type { Redirect } from 'next/dist/lib/load-custom-routes';

/**
 * 撤廃済みコンテンツから現行コンテンツへの恒久リダイレクトマッピング
 *
 * 旧 URL が 404 で残存しているため、301 リダイレクトで検索インデックスを整備する。
 * 撤廃記事に加え、Phase 1 で撤去した自サービスハブ（/services 配下）と
 * 薄いタグページ（/tech/tags 配下）も技術記事一覧へ寄せる。
 * source: 旧 URL（撤廃済み）
 * destination: 移転先コンテンツ URL（実在する記事・カテゴリ・一覧ページ）
 */
export const RETIRED_ARTICLE_REDIRECTS: ReadonlyArray<{
  source: string;
  destination: string;
}> = [
  {
    source: '/tech/eventbridge-scheduler',
    destination: '/tech/eventbridge-rule-scheduling',
  },
  {
    source: '/tech/aws-batch-parallelism',
    destination: '/tech/aws-batch-architecture',
  },
  {
    source: '/tech/cloudfront-functions-vs-edge',
    destination: '/tech/cloudfront-cache-strategy',
  },
  {
    source: '/tech/aws-ses-transactional-mail',
    destination: '/tech/category/aws',
  },
  {
    source: '/tech/aws-waf-protection',
    destination: '/tech/category/aws',
  },
  {
    source: '/tech/cognito-oauth-implementation',
    destination: '/tech/category/aws',
  },
  {
    source: '/tech/vapid-web-push',
    destination: '/tech/category/dev-stack',
  },
  {
    source: '/tech/web-push-server-implementation',
    destination: '/tech/category/dev-stack',
  },
  {
    // codec-converter サービスページは Phase 1 で撤去したため /tech へ寄せる
    source: '/tech/video-codec-comparison',
    destination: '/tech',
  },
  {
    source: '/tech/zod-runtime-validation',
    destination: '/tech/discriminated-union-api',
  },
  // Phase 1 で撤去した自サービスハブ・薄いタグページの恒久リダイレクト。
  // 旧 URL のインデックスを技術記事一覧へ集約する。
  {
    source: '/services',
    destination: '/tech',
  },
  {
    source: '/services/:path*',
    destination: '/tech',
  },
  {
    source: '/tech/tags/:tag*',
    destination: '/tech',
  },
] as const;

/**
 * Next.js redirects() 関数に渡す形式に変換する
 */
export function buildRedirects(): Redirect[] {
  return RETIRED_ARTICLE_REDIRECTS.map(({ source, destination }) => ({
    source,
    destination,
    permanent: true,
  }));
}
