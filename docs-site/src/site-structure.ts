/**
 * サイドバーの章立て。docs のディレクトリ構成ではなく、読み手が探す順に並べる。
 * 章の中のページ一覧は docs から自動で作るため、ページを足してもここは書き換えない。
 */

/** サービスごとの小見出しになるカードの種別。ディレクトリ名と表示名の対応はここだけで持つ。 */
export const CARD_KINDS = [
  { dir: 'screen', title: '画面' },
  { dir: 'api', title: 'API' },
  { dir: 'batch', title: 'バッチ' },
  { dir: 'flow', title: '処理の流れ' },
  { dir: 'term', title: '用語' },
] as const;

export type StructureNode =
  /** 1 ページ。title を省くとファイルの最初の `# 見出し` を使う */
  | { type: 'page'; path: string; title?: string }
  /** ディレクトリ直下の .md を並べる (README.md は除く) */
  | { type: 'files'; dir: string; exclude?: readonly string[] }
  /** ディレクトリを入れ子のまま自動で並べる。README.md があれば入口にする */
  | { type: 'directory'; path: string; title?: string; collapsed?: boolean }
  | { type: 'group'; title: string; collapsed: boolean; items: readonly StructureNode[] }
  | {
      type: 'services';
      /** 設計資料のディレクトリ */
      designDir: string;
      /** カードのディレクトリ。直下のディレクトリがサービス名 */
      cardsDir: string;
      /** カード側にあっても、サービスとして扱わないディレクトリ */
      excludeServices: readonly string[];
      designTitle: string;
      /** サービスの設計資料に追加で入れるページ (サービス名 → docs からの相対パス) */
      extraDesign: Readonly<Record<string, readonly string[]>>;
    };

export const SITE_STRUCTURE: readonly StructureNode[] = [
  { type: 'page', path: 'README.md', title: 'はじめに' },
  {
    type: 'group',
    title: 'サービス',
    collapsed: false,
    items: [
      {
        type: 'services',
        designDir: 'services',
        cardsDir: 'specs',
        excludeServices: ['platform'],
        designTitle: '設計資料',
        // dev-sync は専用のサービスディレクトリを持たず、設計資料が開発の文書と同じ場所にある
        extraDesign: { 'dev-sync': ['development/dev-sync.md'] },
      },
    ],
  },
  {
    type: 'group',
    title: '共通基盤',
    collapsed: false,
    items: [
      { type: 'directory', path: 'specs/platform/term', title: '共通の用語' },
      { type: 'directory', path: 'libs', title: 'ライブラリ' },
      { type: 'directory', path: 'infra', title: 'インフラ' },
    ],
  },
  {
    type: 'group',
    title: '開発の進め方',
    collapsed: true,
    items: [
      { type: 'files', dir: 'development', exclude: ['development/dev-sync.md'] },
      { type: 'page', path: 'branching.md' },
      // 仕様カードという語を見出しに出すのは、カードの書き方の文書だけ
      { type: 'page', path: 'specs/README.md', title: '仕様カードの書き方' },
      { type: 'directory', path: 'agents', title: 'エージェント' },
    ],
  },
];
