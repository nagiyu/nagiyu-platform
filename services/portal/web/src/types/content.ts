/** 技術記事のフロントマター */
export type ArticleMeta = {
  title: string;
  description: string;
  slug: string;
  publishedAt: string; // ISO 8601 date
  updatedAt?: string; // ISO 8601 date（任意。記事の最終更新日）
  author?: string; // 任意。未指定時は AUTHOR.name を使用
  tags: string[];
  categories?: string[]; // 任意。記事カードのカテゴリラベル（非リンク Chip）に使う slug 配列（複数可）
  featured?: boolean; // 任意。トップページ特集記事として表示する場合 true
};

/** 技術記事（フロントマター + 本文） */
export type Article = ArticleMeta & {
  content: string; // HTML（remark/rehype 変換済み）
};
