import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import DOMPurify from 'isomorphic-dompurify';
import type { ServiceDocument, ServiceDocumentMeta, Article, ArticleMeta } from '@/types/content';

const ERROR_MESSAGES = {
    SERVICE_DOCUMENT_NOT_FOUND: 'サービスドキュメントが見つかりません',
    ARTICLE_NOT_FOUND: '技術記事が見つかりません',
    INVALID_FRONTMATTER: 'フロントマターの形式が正しくありません',
} as const;

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content');
const SERVICES_DIR = path.join(CONTENT_DIR, 'services');
const TECH_DIR = path.join(CONTENT_DIR, 'tech');

const TYPE_TO_FILENAME: Record<'overview' | 'guide' | 'faq', string> = {
    overview: 'index.md',
    guide: 'guide.md',
    faq: 'faq.md',
};

/**
 * Markdown 文字列を HTML に変換する
 */
async function markdownToHtml(markdown: string): Promise<string> {
    const result = await remark().use(remarkRehype).use(rehypeStringify).process(markdown);
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
 * 全技術記事のメタデータ一覧を返す（publishedAt 降順）
 */
export function getAllArticles(): ArticleMeta[] {
    if (!fs.existsSync(TECH_DIR)) {
        return [];
    }

    const files = fs
        .readdirSync(TECH_DIR)
        .filter((file) => file.endsWith('.md'));

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
