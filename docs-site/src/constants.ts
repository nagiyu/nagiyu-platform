/** サイトの設定値。カスタムドメインへ移すときはここだけを変える。 */
export const SITE_CONFIG = {
  title: 'nagiyu-platform docs',
  description: 'nagiyu-platform のドキュメント',
  lang: 'ja',
  base: '/nagiyu-platform/',
} as const;

/** 文書の sources を開くリポジトリの場所 */
export const REPOSITORY_BLOB_URL = 'https://github.com/nagiyu/nagiyu-platform/blob/develop/';

/**
 * サイドバーに出さない docs 直下の相対パス。読み物でないページを除くための口で、今は除くものがない。
 * 新しい配置の雛形は layout.json の template から作る。
 */
export const SIDEBAR_EXCLUDED: readonly string[] = [];

export const ERROR_MESSAGES = {
  DOCS_DIR_NOT_FOUND: (dir: string) => `docs ディレクトリが見つかりません: ${dir}`,
  LAYOUT_NOT_FOUND: (file: string) => `配置の定義が見つかりません: ${file}`,
  PAGE_NOT_FOUND: (path: string) => `章立てに指定されたページが docs にありません: ${path}`,
  UNLISTED_PAGES: (paths: readonly string[]) =>
    `サイドバーに載っていないページがあります。docs/layout.json の配置に当てるか、旧配置の章立てに加えるか、除外に加えてください:\n${paths.map((p) => `  - ${p}`).join('\n')}`,
  DUPLICATE_PAGES: (paths: readonly string[]) =>
    `サイドバーの複数の場所に載っているページがあります:\n${paths.map((p) => `  - ${p}`).join('\n')}`,
} as const;
