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
  tags: string[];
};

/** 技術記事（フロントマター + 本文） */
export type Article = ArticleMeta & {
  content: string; // HTML（remark/rehype 変換済み）
};

/** サービス一覧カード表示用 */
export type ServiceCard = {
  slug: string;
  name: string;
  description: string; // index.md の description フロントマター
  url: string; // 実際のサービス URL（外部リンク）
};
