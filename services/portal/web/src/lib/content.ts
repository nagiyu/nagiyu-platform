import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import DOMPurify from 'isomorphic-dompurify';
import type {
  ServiceDocument,
  ServiceDocumentMeta,
  Article,
  ArticleMeta,
  TechCategory,
  TechCategoryMeta,
} from '@/types/content';
import type { FaqPair } from '@/lib/jsonLd';

const ERROR_MESSAGES = {
  SERVICE_DOCUMENT_NOT_FOUND: 'サービスドキュメントが見つかりません',
  ARTICLE_NOT_FOUND: '技術記事が見つかりません',
  TECH_CATEGORY_NOT_FOUND: 'カテゴリ別ハブが見つかりません',
  INVALID_FRONTMATTER: 'フロントマターの形式が正しくありません',
} as const;

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content');
const SERVICES_DIR = path.join(CONTENT_DIR, 'services');
const TECH_DIR = path.join(CONTENT_DIR, 'tech');
const TECH_CATEGORY_DIR = path.join(CONTENT_DIR, 'tech-category');

/**
 * カテゴリ別ハブの slug 一覧（表示順を兼ねる）。
 * `/tech/category/{slug}` の静的生成・並び順の正とする。
 */
export const TECH_CATEGORY_SLUGS = ['aws', 'nextjs', 'dev-stack'] as const;

const TYPE_TO_FILENAME: Record<'overview' | 'guide' | 'faq', string> = {
  overview: 'index.md',
  guide: 'guide.md',
  faq: 'faq.md',
};

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
 * サービスドキュメントを取得する
 * @param slug - サービス slug（例: 'tools', 'quick-clip'）
 * @param type - ドキュメント種別（'overview' | 'guide' | 'faq'）
 */
export async function getServiceDocument(
  slug: string,
  type: 'overview' | 'guide' | 'faq'
): Promise<ServiceDocument> {
  const filename = TYPE_TO_FILENAME[type];
  const filePath = path.join(SERVICES_DIR, slug, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(ERROR_MESSAGES.SERVICE_DOCUMENT_NOT_FOUND);
  }

  const fileContents = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContents);
  const meta = data as ServiceDocumentMeta;
  const htmlContent = await markdownToHtml(content);

  return {
    ...meta,
    content: htmlContent,
    slug,
  };
}

/**
 * サービスの FAQ ページから Q&A ペアを抽出して返す
 * @param slug - サービス slug（例: 'tools', 'quick-clip'）
 * @returns Q&A ペアの配列（FAQ ファイルが存在しない場合は空配列）
 */
export function getServiceFaqPairs(slug: string): FaqPair[] {
  const filePath = path.join(SERVICES_DIR, slug, 'faq.md');
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const fileContents = fs.readFileSync(filePath, 'utf8');
  const { content } = matter(fileContents);
  return extractFaqPairs(content);
}

/**
 * 全サービス slug を返す（generateStaticParams 用）
 */
export function getAllServiceSlugs(): string[] {
  if (!fs.existsSync(SERVICES_DIR)) {
    return [];
  }
  return fs
    .readdirSync(SERVICES_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
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
 * 全タグを記事数の多い順に返す
 */
export function getAllTags(): { tag: string; count: number }[] {
  const counter = new Map<string, number>();
  for (const article of getAllArticles()) {
    for (const tag of article.tags) {
      counter.set(tag, (counter.get(tag) ?? 0) + 1);
    }
  }
  return [...counter.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.tag.localeCompare(b.tag);
    });
}

/**
 * タグ名を URL 用のスラッグに変換する
 * - 小文字化
 * - スペースとスラッシュをハイフンに置換
 * - 連続するハイフンを 1 つに集約
 *
 * 例: "AWS Batch" → "aws-batch" / "Next.js" → "next.js"
 *
 * Next.js のルーティングで `%20`（エンコードされたスペース）が prerender-manifest と
 * 照合されない不具合を回避するため、URL からスペースを排除する目的で導入。
 */
export function tagToSlug(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * 非 ASCII を含むスラッグも Next.js のルーティングで安定しないため、
 * ページ化対象は ASCII スラッグに収まるタグのみとする。
 */
export function isLinkableTag(tag: string): boolean {
  return /^[a-z0-9.@_-]+$/.test(tagToSlug(tag));
}

/**
 * スラッグからオリジナルのタグ名を逆引きする
 */
export function getTagBySlug(slug: string): string | null {
  return getAllTags().find((entry) => tagToSlug(entry.tag) === slug)?.tag ?? null;
}

/**
 * 指定タグを持つ記事を publishedAt 降順で返す
 */
export function getArticlesByTag(tag: string): ArticleMeta[] {
  return getAllArticles().filter((article) => article.tags.includes(tag));
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
  serviceCount: number;
  categoryCount: number;
} {
  const articleCount = getAllArticles().length;
  const serviceCount = getAllServiceSlugs().length;
  const categoryCount = getAllTechCategoryMetas().length;
  return { articleCount, serviceCount, categoryCount };
}

/**
 * FAQ Markdown の本文から Q&A ペアを抽出する。
 *
 * 抽出ルール:
 * - `### Q.` で始まる見出し行を質問として扱う
 * - 見出し直後の段落で `**A.**` で始まるテキストを回答として扱う
 * - `**A.**` プレフィックス自体は回答テキストから除去する
 *
 * @param markdownContent - frontmatter を除いた Markdown 本文
 * @returns Q&A ペアの配列
 */
export function extractFaqPairs(markdownContent: string): FaqPair[] {
  const lines = markdownContent.split('\n');
  const pairs: FaqPair[] = [];

  let currentQuestion: string | null = null;
  let collectingAnswer = false;
  let answerLines: string[] = [];

  const flush = () => {
    if (currentQuestion !== null && answerLines.length > 0) {
      const rawAnswer = answerLines.join(' ').trim();
      // `**A.**` プレフィックスを除去してプレーンテキスト化
      const answer = rawAnswer
        .replace(/^\*\*A\.\*\*\s*/, '')
        .replace(/\*\*/g, '')
        .trim();
      if (answer.length > 0) {
        pairs.push({ question: currentQuestion, answer });
      }
    }
    currentQuestion = null;
    collectingAnswer = false;
    answerLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // `### Q.` で始まる見出しを検出
    const questionMatch = trimmed.match(/^###\s+Q\.\s+(.+)$/);
    if (questionMatch) {
      flush();
      currentQuestion = questionMatch[1].trim();
      collectingAnswer = false;
      answerLines = [];
      continue;
    }

    if (currentQuestion !== null) {
      if (trimmed.startsWith('**A.**')) {
        // 回答段落の開始
        collectingAnswer = true;
        answerLines = [trimmed];
        continue;
      }

      if (collectingAnswer) {
        if (trimmed === '' || trimmed.startsWith('#') || trimmed === '---') {
          // 空行・別見出し・区切り線で回答終了
          if (trimmed.startsWith('#') || trimmed === '---') {
            flush();
            continue;
          }
          // 空行はそのまま回答を確定して次の見出しを待つ
          flush();
          continue;
        }
        // 複数行の回答を結合
        answerLines.push(trimmed);
      }
    }
  }

  // 末尾に達した時点で未確定の Q&A を確定
  flush();

  return pairs;
}
