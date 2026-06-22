import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import DOMPurify from 'isomorphic-dompurify';
import type { Article, ArticleMeta, TechCategory, TechCategoryMeta } from '@/types/content';

const ERROR_MESSAGES = {
  ARTICLE_NOT_FOUND: '技術記事が見つかりません',
  TECH_CATEGORY_NOT_FOUND: 'カテゴリ別ハブが見つかりません',
} as const;

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content');
const TECH_DIR = path.join(CONTENT_DIR, 'tech');
const TECH_CATEGORY_DIR = path.join(CONTENT_DIR, 'tech-category');

/**
 * カテゴリ別ハブの slug 一覧（表示順を兼ねる）。
 * `/tech/category/{slug}` の静的生成・並び順の正とする。
 */
export const TECH_CATEGORY_SLUGS = ['aws', 'nextjs', 'dev-stack'] as const;

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
 * 全カテゴリ別ハブのメタデータを TECH_CATEGORY_SLUGS の順で返す。
 * Markdown ファイルが存在しない slug は黙って除外する。
 */
export function getAllTechCategoryMetas(): TechCategoryMeta[] {
  return TECH_CATEGORY_SLUGS.map((slug): TechCategoryMeta | null => {
    const filePath = path.join(TECH_CATEGORY_DIR, `${slug}.md`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const { data } = matter(fileContents);
    const meta = data as Omit<TechCategoryMeta, 'slug'>;
    return { ...meta, slug };
  }).filter((meta): meta is TechCategoryMeta => meta !== null);
}

/**
 * カテゴリ別ハブの解説本文（HTML 変換済み）を取得する
 * @param slug - ハブ slug（aws / nextjs / dev-stack）
 */
export async function getTechCategory(slug: string): Promise<TechCategory> {
  const filePath = path.join(TECH_CATEGORY_DIR, `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(ERROR_MESSAGES.TECH_CATEGORY_NOT_FOUND);
  }

  const fileContents = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContents);
  const meta = data as Omit<TechCategoryMeta, 'slug'>;
  const htmlContent = await markdownToHtml(content);

  return {
    ...meta,
    slug,
    content: htmlContent,
  };
}

/**
 * 指定カテゴリ別ハブに所属する記事を publishedAt 降順で返す。
 * 記事側フロントマターの `categories` に slug を含むものを抽出する。
 */
export function getArticlesByCategory(slug: string): ArticleMeta[] {
  return getAllArticles().filter((article) => article.categories?.includes(slug));
}

/**
 * 記事が所属するカテゴリ別ハブのメタデータを返す（記事 → ハブの戻りリンク用）。
 * 実在するハブのみを TECH_CATEGORY_SLUGS の順で返す。
 * @param categories - 記事フロントマターの categories（未設定なら空配列）
 */
export function getTechCategoriesForArticle(categories: string[] | undefined): TechCategoryMeta[] {
  if (!categories || categories.length === 0) {
    return [];
  }
  const categorySet = new Set(categories);
  return getAllTechCategoryMetas().filter((meta) => categorySet.has(meta.slug));
}

/**
 * サイト全体の統計情報を返す（ヒーローセクション用）
 */
export function getSiteStats(): {
  articleCount: number;
  categoryCount: number;
} {
  const articleCount = getAllArticles().length;
  const categoryCount = getAllTechCategoryMetas().length;
  return { articleCount, categoryCount };
}
