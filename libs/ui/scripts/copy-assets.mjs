/**
 * tsc 後に CSS 等の非 TypeScript アセットを dist/ に複製するスクリプト。
 *
 * tsc は CSS ファイルを処理しないため、CSS で配布したいトークン定義などは
 * 本スクリプトで明示的に dist/ に複製する必要がある。
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const assets = [
  { from: 'src/styles/tokens.css', to: 'dist/src/styles/tokens.css' },
];

for (const { from, to } of assets) {
  const src = resolve(root, from);
  const dest = resolve(root, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`copied: ${from} -> ${to}`);
}
