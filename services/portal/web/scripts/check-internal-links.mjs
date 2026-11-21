// @ts-check
/**
 * Portal 内部リンクチェックスクリプトの入口
 *
 * 検査ロジックは src/lib/linkChecker.ts にあり、ここでは対象ディレクトリの解決と
 * 結果の出力・終了コードだけを担う。CI が共通ライブラリのビルド無し (npm ci のみ) で
 * 動かすため、TypeScript はビルドせず Node の型除去で直接読み込む。
 *
 * 使用方法: node scripts/check-internal-links.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { checkAllInternalLinks } from '../src/lib/linkChecker.ts';

const PORTAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(PORTAL_DIR, 'src');

const startTime = Date.now();
const broken = checkAllInternalLinks({
  contentDir: path.join(SRC_DIR, 'content'),
  srcDir: SRC_DIR,
  portalDir: PORTAL_DIR,
});
const elapsed = Date.now() - startTime;

if (broken.length === 0) {
  console.log(`内部リンク切れなし（検査完了 ${elapsed}ms）`);
  process.exit(0);
}

console.error(`内部リンク切れ ${broken.length} 件を検出（検査完了 ${elapsed}ms）\n`);
for (const item of broken) {
  console.error(`  ${item.file}:${item.line}  ${item.href}`);
  console.error(`    理由: ${item.reason}`);
}
process.exit(1);
