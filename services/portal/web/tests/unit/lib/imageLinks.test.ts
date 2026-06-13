/**
 * Markdown 内の画像参照（![](...)）がすべて public/ 配下に実在することを検証するテスト。
 * 今後の画像リンク切れを防止するために追加。
 */
import fs from 'fs';
import path from 'path';

/** Portal web ルートディレクトリ */
const PORTAL_DIR = path.join(__dirname, '../../..');
/** 実際のコンテンツディレクトリ */
const CONTENT_DIR = path.join(PORTAL_DIR, 'src', 'content');
/** public ディレクトリ */
const PUBLIC_DIR = path.join(PORTAL_DIR, 'public');

/** Markdown ファイルを再帰的に列挙する */
function walkMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Markdown 本文からローカル画像参照パスを抽出する */
function extractLocalImagePaths(content: string): string[] {
  // ![alt](/path/to/image.ext) 形式のローカルパスを抽出（http:// などは除外）
  const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = imageRegex.exec(content)) !== null) {
    const src = match[1].trim();
    // ローカルパスのみ対象（/ で始まり、http:// / https:// を含まない）
    if (src.startsWith('/') && !src.startsWith('//') && !src.includes('://')) {
      paths.push(src);
    }
  }
  return paths;
}

describe('Markdown 内の画像参照が public/ に実在する', () => {
  /**
   * コンテンツディレクトリが存在する場合のテスト
   */
  describe('tech 記事', () => {
    it('tech 記事内の全ローカル画像参照が public/ に存在する', () => {
      const techDir = path.join(CONTENT_DIR, 'tech');
      const markdownFiles = walkMarkdownFiles(techDir);

      const broken: Array<{ file: string; imagePath: string }> = [];

      for (const mdFile of markdownFiles) {
        const content = fs.readFileSync(mdFile, 'utf8');
        const imagePaths = extractLocalImagePaths(content);
        for (const imagePath of imagePaths) {
          const publicFilePath = path.join(PUBLIC_DIR, imagePath);
          if (!fs.existsSync(publicFilePath)) {
            broken.push({
              file: path.relative(PORTAL_DIR, mdFile),
              imagePath,
            });
          }
        }
      }

      if (broken.length > 0) {
        const message = broken.map((b) => `  ${b.file}: ${b.imagePath}`).join('\n');
        throw new Error(`以下の画像参照が public/ に存在しません:\n${message}`);
      }

      expect(broken).toHaveLength(0);
    });
  });

  describe('サービスドキュメント', () => {
    it('サービスドキュメント内の全ローカル画像参照が public/ に存在する', () => {
      const servicesDir = path.join(CONTENT_DIR, 'services');
      const markdownFiles = walkMarkdownFiles(servicesDir);

      const broken: Array<{ file: string; imagePath: string }> = [];

      for (const mdFile of markdownFiles) {
        const content = fs.readFileSync(mdFile, 'utf8');
        const imagePaths = extractLocalImagePaths(content);
        for (const imagePath of imagePaths) {
          const publicFilePath = path.join(PUBLIC_DIR, imagePath);
          if (!fs.existsSync(publicFilePath)) {
            broken.push({
              file: path.relative(PORTAL_DIR, mdFile),
              imagePath,
            });
          }
        }
      }

      if (broken.length > 0) {
        const message = broken.map((b) => `  ${b.file}: ${b.imagePath}`).join('\n');
        throw new Error(`以下の画像参照が public/ に存在しません:\n${message}`);
      }

      expect(broken).toHaveLength(0);
    });
  });

  describe('ユーティリティ関数', () => {
    describe('walkMarkdownFiles', () => {
      it('存在しないディレクトリに対して空配列を返す', () => {
        const result = walkMarkdownFiles('/nonexistent/path');
        expect(result).toEqual([]);
      });

      it('.md ファイルのみを返す', () => {
        const techDir = path.join(CONTENT_DIR, 'tech');
        if (fs.existsSync(techDir)) {
          const files = walkMarkdownFiles(techDir);
          expect(files.every((f) => f.endsWith('.md'))).toBe(true);
        }
      });

      it('tech ディレクトリ内の Markdown ファイルを列挙する', () => {
        const techDir = path.join(CONTENT_DIR, 'tech');
        if (fs.existsSync(techDir)) {
          const files = walkMarkdownFiles(techDir);
          expect(files.length).toBeGreaterThan(0);
        }
      });
    });

    describe('extractLocalImagePaths', () => {
      it('ローカル画像パスを抽出する', () => {
        const content = '![説明文](/images/tech/sample.png)';
        const paths = extractLocalImagePaths(content);
        expect(paths).toEqual(['/images/tech/sample.png']);
      });

      it('外部 URL を除外する', () => {
        const content = '![外部画像](https://example.com/image.png)';
        const paths = extractLocalImagePaths(content);
        expect(paths).toHaveLength(0);
      });

      it('プロトコル相対 URL を除外する', () => {
        const content = '![プロトコル相対](//example.com/image.png)';
        const paths = extractLocalImagePaths(content);
        expect(paths).toHaveLength(0);
      });

      it('複数の画像参照を抽出する', () => {
        const content = `
![図1](/images/tech/figure1.png)
通常テキスト
![図2](/images/tech/figure2.png)
`;
        const paths = extractLocalImagePaths(content);
        expect(paths).toHaveLength(2);
        expect(paths[0]).toBe('/images/tech/figure1.png');
        expect(paths[1]).toBe('/images/tech/figure2.png');
      });

      it('画像参照がない場合は空配列を返す', () => {
        const content = '## タイトル\n\nテキストのみ。';
        const paths = extractLocalImagePaths(content);
        expect(paths).toHaveLength(0);
      });

      it('alt テキストが空の画像参照も抽出する', () => {
        const content = '![](/images/tech/no-alt.png)';
        const paths = extractLocalImagePaths(content);
        expect(paths).toHaveLength(1);
      });

      it('空文字列に対して空配列を返す', () => {
        const paths = extractLocalImagePaths('');
        expect(paths).toHaveLength(0);
      });
    });
  });
});
