import type { Redirect } from 'next/dist/lib/load-custom-routes';

/**
 * 旧 URL から現行コンテンツへの恒久リダイレクトマッピング
 *
 * 旧 URL が検索インデックスに残存するため、301 リダイレクトで現行コンテンツへ集約する。
 * source: リダイレクト元の旧 URL
 * destination: 移転先（実在する記事・カテゴリ・一覧ページ）
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
    source: '/tech/video-codec-comparison',
    destination: '/tech',
  },
  {
    source: '/tech/zod-runtime-validation',
    destination: '/tech/discriminated-union-api',
  },
  // /services・/tech/tags 配下を技術記事一覧へ集約する。
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
