import * as fs from 'fs';
import * as path from 'path';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';

const TECH_DIR = path.join(process.cwd(), 'src', 'content', 'tech');

/**
 * src/content/tech/ 配下の .md ファイル名（slug）一覧を取得する
 */
function getArticleSlugs(): string[] {
  return fs
    .readdirSync(TECH_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}

/**
 * frontmatter を除いた本文を返す
 */
function readArticleBody(slug: string): string {
  const raw = fs.readFileSync(path.join(TECH_DIR, `${slug}.md`), 'utf8');
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '');
}

/**
 * Markdown を HTML に変換する。
 *
 * `src/lib/content.ts` の変換と同じ remark / rehype パイプラインを使うが、
 * サニタイズ（DOMPurify）は行わない。DOMPurify は jsdom に依存しており
 * テスト環境へ持ち込むと変換対象が大きく広がる一方、太字の解釈には
 * 一切影響しないため、この検査では不要。
 */
async function markdownToHtml(markdown: string): Promise<string> {
  const result = await remark()
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);
  return result.toString();
}

/**
 * レンダリング済み HTML から、コード表現（`<pre>` / `<code>`）を除去する。
 *
 * glob（`services/**`）や `**kwargs` のように、コード内の `**` は文字どおりの
 * 表記として正当なため、検査対象から外す。
 */
function stripCodeElements(html: string): string {
  return html.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<code[\s\S]*?<\/code>/g, '');
}

describe('技術記事のレンダリング', () => {
  const slugs = getArticleSlugs();

  it('検査対象の記事が 1 本以上存在すること', () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  /**
   * CommonMark の emphasis flanking rule により、`**` は前後の文字種によって
   * 開き / 閉じとして機能しないことがある。日本語では「約物やインラインコードの
   * 直後・直前」で頻繁に踏み、`**` がそのまま本文に表示される。
   *
   * 原稿の Markdown を静的に解析しても開き / 閉じの判別が難しいため、
   * 変換後の HTML に生の `**` が残っていないかで検出する。
   *
   * 保証範囲: 検出できるのは「`**` が対応を失って本文に残る」ケースのみ。
   * `**` がすべて消費されたうえで意図と違う範囲が強調される場合は検出できない
   * （HTML 上は正常な `<strong>` になるため）。
   */
  describe.each(slugs)('%s', (slug) => {
    it('本文に生の `**` が残っていないこと（太字が閉じている）', async () => {
      const html = await markdownToHtml(readArticleBody(slug));
      const prose = stripCodeElements(html);

      // 失敗時に該当箇所が分かるよう、前後の文脈ごと抽出する
      const leftovers = prose.match(/.{0,24}\*\*.{0,12}/g) ?? [];

      expect(leftovers).toEqual([]);
    });
  });
});
