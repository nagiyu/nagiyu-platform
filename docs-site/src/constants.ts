/** サイトの設定値。カスタムドメインへ移すときはここだけを変える。 */
export const SITE_CONFIG = {
  title: 'nagiyu-platform docs',
  description: 'nagiyu-platform のドキュメント',
  lang: 'ja',
  base: '/nagiyu-platform/',
} as const;

/** 仕様カードの sources を開くリポジトリの場所 */
export const REPOSITORY_BLOB_URL = 'https://github.com/nagiyu/nagiyu-platform/blob/develop/';

/**
 * サイドバーに出さない docs 直下の相対パス。サービス文書の雛形で、読み物ではない。
 * ページ自体は残す (開発フローの文書が雛形のディレクトリへリンクしており、除くとリンク切れになる)。
 */
export const SIDEBAR_EXCLUDED = ['templates/**'];

export const ERROR_MESSAGES = {
  DOCS_DIR_NOT_FOUND: (dir: string) => `docs ディレクトリが見つかりません: ${dir}`,
  PAGE_NOT_FOUND: (path: string) => `章立てに指定されたページが docs にありません: ${path}`,
  UNLISTED_PAGES: (paths: readonly string[]) =>
    `サイドバーに載っていないページがあります。site-structure.ts の章立てに当てるか、除外に加えてください:\n${paths.map((p) => `  - ${p}`).join('\n')}`,
  DUPLICATE_PAGES: (paths: readonly string[]) =>
    `サイドバーの複数の場所に載っているページがあります:\n${paths.map((p) => `  - ${p}`).join('\n')}`,
} as const;
