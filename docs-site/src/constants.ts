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
} as const;
