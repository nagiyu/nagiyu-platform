/**
 * tsc 後に CSS 等の非 TypeScript アセットを dist/ に複製するスクリプト。
 *
 * tsc は CSS ファイルを処理しないため、CSS で配布したいトークン定義や
 * コンポーネントの CSS Modules は本スクリプトで明示的に dist/ に複製する。
 *
 * - 単発ファイル: tokens.css 等の固定アセット
 * - パターン: src/ 配下の `*.module.css` を再帰的に検索し、同じ相対パスで dist/ にコピー
 */

import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const fixedAssets = [{ from: 'src/styles/tokens.css', to: 'dist/src/styles/tokens.css' }];

for (const { from, to } of fixedAssets) {
  const src = resolve(root, from);
  const dest = resolve(root, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`copied: ${from} -> ${to}`);
}

/**
 * src/ 配下を再帰的に走査し、`*.module.css` を dist/src/ に複製する。
 */
function copyModuleCss(currentDir) {
  const entries = readdirSync(currentDir);
  for (const entry of entries) {
    const fullPath = join(currentDir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      copyModuleCss(fullPath);
      continue;
    }
    if (!entry.endsWith('.module.css')) continue;
    const rel = relative(root, fullPath);
    const dest = resolve(root, 'dist', rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(fullPath, dest);
    console.log(`copied: ${rel} -> ${relative(root, dest)}`);
  }
}

copyModuleCss(resolve(root, 'src'));
