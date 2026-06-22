import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import DOMPurify from 'isomorphic-dompurify';
import type { Article, ArticleMeta } from '@/types/content';

const ERROR_MESSAGES = {
  ARTICLE_NOT_FOUND: '技術記事が見つかりません',
} as const;

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content');
const TECH_DIR = path.join(CONTENT_DIR, 'tech');

/**
 * カテゴリ slug → 表示名マップ
 * ハブ本文ファイルを廃止したため、ここで一元管理する。
 */
export const CATEGORY_LABEL_MAP: Record<string, string> = {
  aws: 'AWS',
  nextjs: 'Next.js',
  'dev-stack': '開発スタック',
} as const;

/**
 * Markdown 文字列を HTML に変換する
 */
async function markdownToHtml(markdown: string): Promise<string> {
  const result = await remark()
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);
  return DOMPurify.sanitize(result.toString());
}

/**
 * 技術記事を取得する
 * @param slug - 記事 slug
 */
export async function getArticle(slug: string): Promise<Article> {
  const filePath = path.join(TECH_DIR, `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(ERROR_MESSAGES.ARTICLE_NOT_FOUND);
  }

  const fileContents = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContents);
  const meta = data as ArticleMeta;
  const htmlContent = await markdownToHtml(content);

  return {
    ...meta,
    slug,
    content: htmlContent,
  };
}

/**
 * 特集記事（フロントマターに `featured: true` が設定された記事）を publishedAt 降順で返す。
 * 該当記事がゼロ件の場合は例外を投げず空配列を返す。
 * @param limit - 返す最大件数（既定 3）
 */
export function getFeaturedArticles(limit = 3): ArticleMeta[] {
  return getAllArticles()
    .filter((article) => article.featured === true)
    .slice(0, limit);
}

/**
 * 全技術記事のメタデータ一覧を返す（publishedAt 降順）
 */
export function getAllArticles(): ArticleMeta[] {
  if (!fs.existsSync(TECH_DIR)) {
    return [];
  }

  const files = fs.readdirSync(TECH_DIR).filter((file) => file.endsWith('.md'));

  const articles = files.map((file) => {
    const slug = file.replace(/\.md$/, '');
    const filePath = path.join(TECH_DIR, file);
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const { data } = matter(fileContents);
    const meta = data as ArticleMeta;
    return { ...meta, slug };
  });

  return articles.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

/**
 * 指定記事に関連する記事を返す（タグ一致数の多い順、同数なら publishedAt 降順）
 * @param currentSlug - 除外する自記事 slug
 * @param tags - 比較対象のタグ配列
 * @param limit - 返す件数（既定 3）
 */
export function getRelatedArticles(currentSlug: string, tags: string[], limit = 3): ArticleMeta[] {
  const tagSet = new Set(tags);
  const others = getAllArticles().filter((article) => article.slug !== currentSlug);

  const scored = others
    .map((article) => ({
      article,
      score: article.tags.filter((tag) => tagSet.has(tag)).length,
    }))
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return new Date(b.article.publishedAt).getTime() - new Date(a.article.publishedAt).getTime();
  });

  return scored.slice(0, limit).map((entry) => entry.article);
}

/**
 * カテゴリ slug を表示名に変換する。
 * 未知の slug は slug をそのまま返す。
 * @param slug - カテゴリ slug（例: 'aws'）
 */
export function getCategoryLabel(slug: string): string {
  return CATEGORY_LABEL_MAP[slug] ?? slug;
}
