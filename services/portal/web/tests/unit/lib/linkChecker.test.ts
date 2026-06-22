import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  extractInternalLinks,
  techArticleExists,
  techCategoryExists,
  staticPageExists,
  validateHref,
  checkFile,
  checkAllInternalLinks,
  walkFiles,
  publicFileExists,
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

  describe('techArticleExists', () => {
    it('存在する tech 記事は true を返す', () => {
      expect(techArticleExists('test-article-1', FIXTURE_CONTENT_DIR)).toBe(true);
    });

    it('存在しない tech 記事は false を返す', () => {
      expect(techArticleExists('non-existent', FIXTURE_CONTENT_DIR)).toBe(false);
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

  describe('staticPageExists', () => {
    it('STATIC_ROUTES に含まれるパスに対して true を返す', () => {
      expect(staticPageExists('/', REAL_SRC_DIR)).toBe(true);
      expect(staticPageExists('/about', REAL_SRC_DIR)).toBe(true);
      expect(staticPageExists('/privacy', REAL_SRC_DIR)).toBe(true);
      expect(staticPageExists('/terms', REAL_SRC_DIR)).toBe(true);
      expect(staticPageExists('/tech', REAL_SRC_DIR)).toBe(true);
    });

    it('撤去済みの /services は STATIC_ROUTES から外れ false を返す', () => {
      // /services は撤去済みのため実在ルートとして扱わない（src/app/services も存在しない）
      expect(staticPageExists('/services', REAL_SRC_DIR)).toBe(false);
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

    it('存在する /tech/category/{slug} は valid を返す', () => {
      const result = validateHref('/tech/category/aws', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(true);
    });

    it('存在しない /tech/category/{slug} は invalid を返す', () => {
      const result = validateHref('/tech/category/no-category', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('no-category');
    });

    // --- 撤去済みルート（/services・/tech/tags）は壊れたリンクとして検出されること ---
    // チェッカーは /services・/tech/tags 専用の実在判定分岐を持たないため、
    // 対応コンテンツの有無に関わらず常に無効（壊れたリンク）と判定する。退行防止のため negative assertion を置く。

    it('撤去済みの /tech/tags（一覧）は invalid を返す', () => {
      const result = validateHref('/tech/tags', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(false);
    });

    it('撤去済みの /tech/tags/{tagSlug} は invalid を返す', () => {
      // フィクスチャに aws タグを持つ記事が存在しても、ルート自体が撤去済みのため壊れたリンク。
      const result = validateHref('/tech/tags/aws', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('/tech/tags/aws');
    });

    it('撤去済みの /services（一覧）は invalid を返す', () => {
      const result = validateHref('/services', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('/services');
    });

    it('撤去済みの /services/{slug} は invalid を返す', () => {
      const result = validateHref('/services/tools', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('/services/tools');
    });

    it('撤去済みの /services/{slug}/{doc} は invalid を返す', () => {
      const result = validateHref('/services/tools/faq', FIXTURE_CONTENT_DIR, REAL_SRC_DIR);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('/services/tools/faq');
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

    describe('public/ 静的ファイルのフォールバック', () => {
      /** テスト用一時 public ディレクトリ */
      let tmpPublicDir: string;

      beforeEach(() => {
        // テストごとに一時ディレクトリを作成
        tmpPublicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-public-test-'));
        // ダミー画像ファイルを配置
        const imagesDir = path.join(tmpPublicDir, 'images', 'tech');
        fs.mkdirSync(imagesDir, { recursive: true });
        fs.writeFileSync(path.join(imagesDir, 'dummy.png'), 'dummy');
      });

      afterEach(() => {
        // 一時ディレクトリを後始末
        fs.rmSync(tmpPublicDir, { recursive: true, force: true });
      });

      it('public/ に実在する画像リンクは valid を返す', () => {
        const result = validateHref(
          '/images/tech/dummy.png',
          FIXTURE_CONTENT_DIR,
          REAL_SRC_DIR,
          tmpPublicDir
        );
        expect(result.valid).toBe(true);
        expect(result.reason).toBe('');
      });

      it('public/ に存在しない画像リンクは invalid を返す', () => {
        const result = validateHref(
          '/images/tech/does-not-exist.png',
          FIXTURE_CONTENT_DIR,
          REAL_SRC_DIR,
          tmpPublicDir
        );
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('/images/tech/does-not-exist.png');
      });

      it('クエリ文字列付き画像リンクは valid を返す', () => {
        // クエリ除去後に存在するファイルを判定できる
        const result = validateHref(
          '/images/tech/dummy.png?v=1',
          FIXTURE_CONTENT_DIR,
          REAL_SRC_DIR,
          tmpPublicDir
        );
        expect(result.valid).toBe(true);
      });

      it('パストラバーサル（../）を含むリンクは invalid を返す', () => {
        const result = validateHref(
          '/images/../../etc/passwd',
          FIXTURE_CONTENT_DIR,
          REAL_SRC_DIR,
          tmpPublicDir
        );
        expect(result.valid).toBe(false);
      });

      it('publicDir 外を指すパストラバーサルリンクは invalid を返す', () => {
        // /.. で public の一つ上を指すケース
        const result = validateHref('/..', FIXTURE_CONTENT_DIR, REAL_SRC_DIR, tmpPublicDir);
        expect(result.valid).toBe(false);
      });
    });
  });

  describe('publicFileExists', () => {
    /** テスト用一時 public ディレクトリ */
    let tmpPublicDir: string;

    beforeEach(() => {
      tmpPublicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-public-exists-test-'));
      const imagesDir = path.join(tmpPublicDir, 'images', 'tech');
      fs.mkdirSync(imagesDir, { recursive: true });
      fs.writeFileSync(path.join(imagesDir, 'sample.png'), 'sample');
    });

    afterEach(() => {
      fs.rmSync(tmpPublicDir, { recursive: true, force: true });
    });

    it('実在するファイルのパスに対して true を返す', () => {
      expect(publicFileExists('/images/tech/sample.png', tmpPublicDir)).toBe(true);
    });

    it('存在しないファイルのパスに対して false を返す', () => {
      expect(publicFileExists('/images/tech/no-file.png', tmpPublicDir)).toBe(false);
    });

    it('ディレクトリのパスに対して false を返す（ファイルのみ valid）', () => {
      expect(publicFileExists('/images/tech', tmpPublicDir)).toBe(false);
    });

    it('パストラバーサルを含むパスに対して false を返す', () => {
      expect(publicFileExists('/images/../../etc/passwd', tmpPublicDir)).toBe(false);
    });

    it('クエリ文字列を除去してファイルの存在を確認する', () => {
      expect(publicFileExists('/images/tech/sample.png?v=2', tmpPublicDir)).toBe(true);
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

    it('リンク切れを含む内容のファイルからリンク切れ一覧を返す（撤去済みルートも検出）', () => {
      // テスト用の一時ファイルをモックで代替する。
      // /about は実在する有効リンク。/tech/non-existent-slug は存在しない記事。
      // /services/tools・/tech/tags/aws は撤去済みルートのため
      // 壊れたリンクとして検出されること（退行防止）を担保する。
      const mockContent =
        '[存在しない記事](/tech/non-existent-slug)\n[About](/about)\n' +
        '[撤去済みサービス](/services/tools)\n[撤去済みタグ](/tech/tags/aws)';
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(mockContent);

      const testFile = path.join(FIXTURE_CONTENT_DIR, 'tech', 'test-article-1.md');
      const broken = checkFile(testFile, DEFAULT_OPTIONS);
      jest.restoreAllMocks();

      expect(broken).toHaveLength(3);
      expect(broken.some((b) => b.href === '/tech/non-existent-slug')).toBe(true);
      expect(broken.some((b) => b.href === '/services/tools')).toBe(true);
      expect(broken.some((b) => b.href === '/tech/tags/aws')).toBe(true);
      // /about は有効リンクなので壊れたリンクには含まれないこと
      expect(broken.some((b) => b.href === '/about')).toBe(false);
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
