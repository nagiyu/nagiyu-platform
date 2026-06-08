/** サービスドキュメントのフロントマター */
export type ServiceDocumentMeta = {
  title: string;
  description: string;
  service: string; // slug（tools / quick-clip / etc.）
  type: 'overview' | 'guide' | 'faq';
  updatedAt: string; // ISO 8601 date
};

/** サービスドキュメント（フロントマター + 本文） */
export type ServiceDocument = ServiceDocumentMeta & {
  content: string; // HTML（remark/rehype 変換済み）
  slug: string; // サービス slug
};

/** 技術記事のフロントマター */
export type ArticleMeta = {
  title: string;
  description: string;
  slug: string;
  publishedAt: string; // ISO 8601 date
  updatedAt?: string; // ISO 8601 date（任意。記事の最終更新日）
  author?: string; // 任意。未指定時は AUTHOR.name を使用
  tags: string[];
  categories?: string[]; // 任意。所属するカテゴリ別ハブの slug 配列（複数所属可）
  relatedServices?: string[]; // 任意。サービス slug の配列（相互リンク用）
  featured?: boolean; // 任意。トップページ特集記事として表示する場合 true
};

/** 技術記事（フロントマター + 本文） */
export type Article = ArticleMeta & {
  content: string; // HTML（remark/rehype 変換済み）
};

/** カテゴリ別ハブ（テーマ深堀りページ）のフロントマター */
export type TechCategoryMeta = {
  title: string;
  description: string;
  slug: string; // ハブ slug（aws / nextjs / dev-stack）
};

/** カテゴリ別ハブ（フロントマター + 解説本文） */
export type TechCategory = TechCategoryMeta & {
  content: string; // HTML（remark/rehype 変換済み）
};

/** サービス一覧カード表示用 */
export type ServiceCard = {
  slug: string;
  name: string;
  description: string; // index.md の description フロントマター
  url: string; // 実際のサービス URL（外部リンク）
};
