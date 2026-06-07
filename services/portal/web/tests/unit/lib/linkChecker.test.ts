import path from 'path';
import fs from 'fs';
import {
  extractInternalLinks,
  tagToSlug,
  techArticleExists,
  techTagExists,
  techCategoryExists,
  serviceExists,
  serviceDocExists,
  staticPageExists,
  validateHref,
  checkFile,
  checkAllInternalLinks,
  walkFiles,
} from '@/lib/linkChecker';

/** テスト用フィクスチャのコンテンツディレクトリ */
const FIXTURE_CONTENT_DIR = path.join(__dirname, '../../../fixtures/content');
/** 実際の src ディレクトリ（app/page.tsx の存在確認に使用） */
const REAL_SRC_DIR = path.join(__dirname, '../../../src');
/** portal web ルートディレクトリ */
const PORTAL_DIR = path.join(__dirname, '../../..');

const DEFAULT_OPTIONS = {
  contentDir: FIXTURE_CONTENT_DIR,
  srcDir: REAL_SRC_DIR,
  portalDir: PORTAL_DIR,
};

describe('linkChecker', () => {
  describe('extractInternalLinks', () => {
    it('Markdown リンク [text](/path) を抽出する', () => {
      const content = '[記事一覧](/tech)\n[外部サイト](https://example.com)';
      const links = extractInternalLinks(content);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ href: '/tech', line: 1 });
    });

    it('JSX の href="/path" を抽出する', () => {
      const content = '<Link href="/about">About</Link>\n<a href="https://example.com">外部</a>';
      const links = extractInternalLinks(content);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ href: '/about', line: 1 });
    });

    it('アンカー付きリンクのアンカー部分を除外する', () => {
      const content = '[セクション](/tech/article#section)';
      const links = extractInternalLinks(content);
      expect(links).toHaveLength(1);
      expect(links[0].href).toBe('/tech/article');
    });

    it('外部リンク（http://）を除外する', () => {
      const content = '[外部](http://example.com)\n[内部](/about)';
      const links = extractInternalLinks(content);
      expect(links).toHaveLength(1);
      expect(links[0].href).toBe('/about');
    });

    it('外部リンク（https://）を除外する', () => {
      const content = 'href="https://example.com" と href="/internal"';
      const links = extractInternalLinks(content);
      expect(links).toHaveLength(1);
      expect(links[0].href).toBe('/internal');
    });

    it('プロトコル相対 URL（//）を除外する', () => {
      const content = '[テスト](//example.com)\n[内部](/tech)';
      const links = extractInternalLinks(content);
      expect(links).toHaveLength(1);
      expect(links[0].href).toBe('/tech');
    });

    it('複数行にわたるリンクを正しい行番号で抽出する', () => {
      const content = '最初の行\n[記事](/tech/article)\n3行目\nhref="/about"';
      const links = extractInternalLinks(content);
      expect(links).toHaveLength(2);
      expect(links[0]).toMatchObject({ href: '/tech/article', line: 2 });
      expect(links[1]).toMatchObject({ href: '/about', line: 4 });
    });

    it('リンクのないテキストは空配列を返す', () => {
      const content = 'このテキストにはリンクがありません。';
      const links = extractInternalLinks(content);
      expect(links).toHaveLength(0);
    });

    it('同一行の複数リンクを抽出する', () => {
      const content = '[技術](/tech) と [About](/about) へのリンク';
      const links = extractInternalLinks(content);
      expect(links).toHaveLength(2);
      expect(links[0].href).toBe('/tech');
      expect(links[1].href).toBe('/about');
    });

    it('シングルクォートの href を抽出する', () => {
      const content = "href='/privacy'";
      const links = extractInternalLinks(content);
      expect(links).toHaveLength(1);
      expect(links[0].href).toBe('/privacy');
    });

    it('空のコンテンツに対して空配列を返す', () => {
      const links = extractInternalLinks('');
      expect(links).toHaveLength(0);
    });
  });

  describe('tagToSlug', () => {
    it('ASCII タグをそのまま小文字化する', () => {
      expect(tagToSlug('AWS')).toBe('aws');
    });

    it('スペースをハイフンに変換する', () => {
      expect(tagToSlug('AWS Batch')).toBe('aws-batch');
    });

    it('スラッシュをハイフンに変換する', () => {
      expect(tagToSlug('Next.js/React')).toBe('next.js-react');
    });

    it('連続するハイフンを 1 つに集約する', () => {
      expect(tagToSlug('foo  bar')).toBe('foo-bar');
    });

    it('先頭・末尾のハイフンを除去する', () => {
      expect(tagToSlug('-foo-')).toBe('foo');
    });
  });

  describe('techArticleExists', () => {
    it('存在する tech 記事は true を返す', () => {
      expect(techArticleExists('test-article-1', FIXTURE_CONTENT_DIR)).toBe(true);
    });

    it('存在しない tech 記事は false を返す', () => {
      expect(techArticleExists('non-existent', FIXTURE_CONTENT_DIR)).toBe(false);
    });
  });

  describe('techTagExists', () => {
    it('存在するタグスラッグに対して true を返す', () => {
      // test-article-1.md の tags: ['AWS', 'Test'] → aws, test
      expect(techTagExists('aws', FIXTURE_CONTENT_DIR)).toBe(true);
    });

    it('存在しないタグスラッグに対して false を返す', () => {
      expect(techTagExists('nonexistent-tag', FIXTURE_CONTENT_DIR)).toBe(false);
    });

    it('コンテンツディレクトリが存在しない場合は false を返す', () => {
      expect(techTagExists('aws', '/nonexistent/path')).toBe(false);
    });

    it('tags フロントマターがない記事はスキップする', () => {
      // test-article-3.md に tags があるが nonexistent-tag はないのでfalse
      expect(techTagExists('nonexistent', FIXTURE_CONTENT_DIR)).toBe(false);
    });
  });

  describe('techCategoryExists', () => {
    it('存在するカテゴリで記事がある場合は true を返す', () => {
      // fixtures に aws.md があり、test-article-1.md の categories: ['aws']
      expect(techCategoryExists('aws', FIXTURE_CONTENT_DIR)).toBe(true);
    });

    it('カテゴリファイルが存在しない場合は false を返す', () => {
      expect(techCategoryExists('nonexistent', FIXTURE_CONTENT_DIR)).toBe(false);
    });

    it('カテゴリファイルがあり該当記事もある場合は true を返す', () => {
      // nextjs.md はあり、test-article-2.md の categories: ['aws', 'nextjs']
      expect(techCategoryExists('nextjs', FIXTURE_CONTENT_DIR)).toBe(true);
    });

    it('カテゴリファイルはあるが該当記事がない場合は false を返す', () => {
      // aws.md はあるが、contentDir を架空パスにして tech/ ディレクトリが存在しない状況を再現
      const noTechDir = '/tmp/no-tech-dir-fixture';
      // カテゴリファイルのみ存在する最小フィクスチャを利用
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (String(p).endsWith('aws.md')) return true;
        if (String(p).includes('tech') && !String(p).includes('tech-category')) return false;
        return fs.existsSync(p);
      });
      const result = techCategoryExists('aws', noTechDir);
      jest.restoreAllMocks();
      expect(result).toBe(false);
    });
  });

  describe('serviceExists', () => {
    it('存在するサービスに対して true を返す', () => {
      expect(serviceExists('tools', FIXTURE_CONTENT_DIR)).toBe(true);
    });

    it('存在しないサービスに対して false を返す', () => {
      expect(serviceExists('nonexistent-service', FIXTURE_CONTENT_DIR)).toBe(false);
    });
  });

  describe('serviceDocExists', () => {
    it('存在するサービスドキュメントに対して true を返す', () => {
      // fixtures/content/services/tools/index.md が存在する
      expect(serviceDocExists('tools', 'index', FIXTURE_CONTENT_DIR)).toBe(true);
    });

    it('存在するサービスドキュメント（faq）に対して true を返す', () => {
      // fixtures/content/services/tools/faq.md が存在する
      expect(serviceDocExists('tools', 'faq', FIXTURE_CONTENT_DIR)).toBe(true);
    });

    it('存在しないサービスドキュメントに対して false を返す', () => {
      expect(serviceDocExists('tools', 'nonexistent-doc', FIXTURE_CONTENT_DIR)).toBe(false);
    });

    it('存在しないサービス自体に対して false を返す', () => {
      expect(serviceDocExists('nonexistent', 'guide', FIXTURE_CONTENT_DIR)).toBe(false);
    });
  });

  describe('staticPageExists', () => {
    it('STATIC_ROUTES に含まれるパスに対して true を返す', () => {
      expect(staticPageExists('/', REAL_SRC_DIR)).toBe(true);
      expect(staticPageExists('/about', REAL_SRC_DIR)).toBe(true);
      expect(staticPageExists('/privacy', REAL_SRC_DIR)).toBe(true);
      expect(staticPageExists('/terms', REAL_SRC_DIR)).toBe(true);
      expect(staticPageExists('/tech', REAL_SRC_DIR)).toBe(true);
      expect(staticPageExists('/services', REAL_SRC_DIR)).toBe(true);
    });

    it('app/page.tsx が存在するパスに対して true を返す（about は STATIC_ROUTES 経由）', () => {
      expect(staticPageExists('/about', REAL_SRC_DIR)).toBe(true);
    });

    it('存在しないパスに対して false を返す', () => {
      expect(staticPageExists('/nonexistent-page', REAL_SRC_DIR)).toBe(false);
    });
  });

  describe('validateHref', () => {
    it('空文字は valid を返す', () => {
      const result = validateHref('', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(true);
    });

    it('/ で始まらない href は valid を返す（相対パスは対象外）', () => {
      const result = validateHref('relative/path', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(true);
    });

    it('/tech/tags キーワードは valid を返す（/tech/{slug} パターン外）', () => {
      const result = validateHref('/tech/tags', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(true);
    });

    it('/tech/category キーワードは valid を返す（/tech/{slug} パターン外）', () => {
      const result = validateHref('/tech/category', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(true);
    });

    it('存在する /tech/{slug} は valid を返す', () => {
      const result = validateHref('/tech/test-article-1', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(true);
    });

    it('存在しない /tech/{slug} は invalid を返す', () => {
      const result = validateHref('/tech/non-existent', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('non-existent');
    });

    it('存在する /tech/tags/{tagSlug} は valid を返す', () => {
      const result = validateHref('/tech/tags/aws', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(true);
    });

    it('存在しない /tech/tags/{tagSlug} は invalid を返す', () => {
      const result = validateHref('/tech/tags/no-such-tag', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('no-such-tag');
    });

    it('存在する /tech/category/{slug} は valid を返す', () => {
      const result = validateHref('/tech/category/aws', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(true);
    });

    it('存在しない /tech/category/{slug} は invalid を返す', () => {
      const result = validateHref('/tech/category/no-category', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('no-category');
    });

    it('存在する /services/{slug} は valid を返す', () => {
      const result = validateHref('/services/tools', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(true);
    });

    it('存在しない /services/{slug} は invalid を返す', () => {
      const result = validateHref('/services/nonexistent', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('nonexistent');
    });

    it('存在する /services/{slug}/{doc} は valid を返す', () => {
      // fixtures/content/services/tools/index.md に対応する /services/tools/index
      const result = validateHref('/services/tools/index', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(true);
    });

    it('存在する /services/{slug}/{doc}（faq）は valid を返す', () => {
      // fixtures/content/services/tools/faq.md に対応する /services/tools/faq
      const result = validateHref('/services/tools/faq', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(true);
    });

    it('存在しない /services/{slug}/{doc} は invalid を返す', () => {
      const result = validateHref('/services/tools/nonexistent-doc', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('nonexistent-doc');
    });

    it('/services の一覧ページは valid を返す', () => {
      const result = validateHref('/services', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(true);
    });

    it('/tech の一覧ページは valid を返す', () => {
      const result = validateHref('/tech', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(true);
    });

    it('/about は static page として valid を返す', () => {
      const result = validateHref('/about', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(true);
    });

    it('存在しない静的ページは invalid を返す', () => {
      const result = validateHref('/no-such-page', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('/no-such-page');
    });
  });

  describe('walkFiles', () => {
    it('指定した拡張子のファイルを再帰的に列挙する', () => {
      const files = walkFiles(FIXTURE_CONTENT_DIR, ['.md']);
      expect(files.length).toBeGreaterThan(0);
      expect(files.every((f) => f.endsWith('.md'))).toBe(true);
    });

    it('存在しないディレクトリに対して空配列を返す', () => {
      const files = walkFiles('/nonexistent/path', ['.md']);
      expect(files).toEqual([]);
    });

    it('対象外の拡張子のファイルを含まない', () => {
      // fixtures に .tsx はないので空になるはず
      const files = walkFiles(FIXTURE_CONTENT_DIR, ['.tsx']);
      expect(files.every((f) => f.endsWith('.tsx'))).toBe(true);
    });
  });

  describe('checkFile', () => {
    it('リンク切れがないファイルは空配列を返す', () => {
      const testFile = path.join(FIXTURE_CONTENT_DIR, 'tech', 'test-article-1.md');
      const broken = checkFile(testFile, DEFAULT_OPTIONS);
      expect(broken).toHaveLength(0);
    });

    it('リンク切れを含む内容のファイルからリンク切れ一覧を返す', () => {
      // テスト用の一時ファイルをモックで代替する
      const mockContent =
        '[存在しない記事](/tech/non-existent-slug)\n[About](/about)\n[存在しないサービス](/services/no-service)';
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(mockContent);

      const testFile = path.join(FIXTURE_CONTENT_DIR, 'tech', 'test-article-1.md');
      const broken = checkFile(testFile, DEFAULT_OPTIONS);
      jest.restoreAllMocks();

      expect(broken).toHaveLength(2);
      expect(broken.some((b) => b.href === '/tech/non-existent-slug')).toBe(true);
      expect(broken.some((b) => b.href === '/services/no-service')).toBe(true);
    });

    it('リンク切れに file・line・href・reason を含む', () => {
      const mockContent = '[壊れたリンク](/tech/broken-article-xyz)';
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(mockContent);

      const testFile = path.join(FIXTURE_CONTENT_DIR, 'tech', 'test-article-1.md');
      const broken = checkFile(testFile, DEFAULT_OPTIONS);
      jest.restoreAllMocks();

      expect(broken).toHaveLength(1);
      const item = broken[0];
      expect(typeof item.file).toBe('string');
      expect(item.file.startsWith('/')).toBe(false); // 相対パス
      expect(item.line).toBe(1);
      expect(item.href).toBe('/tech/broken-article-xyz');
      expect(typeof item.reason).toBe('string');
      expect(item.reason.length).toBeGreaterThan(0);
    });
  });

  describe('checkAllInternalLinks', () => {
    it('フィクスチャコンテンツのリンク切れなしを確認する', () => {
      // フィクスチャに内部リンクを含む Markdown はないのでリンク切れゼロ
      const broken = checkAllInternalLinks(DEFAULT_OPTIONS);
      expect(broken).toHaveLength(0);
    });

    it('BrokenLink の file フィールドは portalDir からの相対パス', () => {
      const mockContent = '[壊れたリンク](/tech/no-exist)';
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(mockContent);

      const broken = checkAllInternalLinks(DEFAULT_OPTIONS);
      jest.restoreAllMocks();

      if (broken.length > 0) {
        expect(broken[0].file.startsWith('/')).toBe(false);
      }
    });

    it('contentDir と srcDir が存在しない場合は空配列を返す', () => {
      const broken = checkAllInternalLinks({
        contentDir: '/nonexistent/content',
        srcDir: '/nonexistent/src',
        portalDir: '/nonexistent',
      });
      expect(broken).toEqual([]);
    });
  });
});
