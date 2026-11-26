/**
 * dist/cjs に `{"type": "commonjs"}` の package.json を置くスクリプト。
 *
 * パッケージが `"type": "module"` のため、置かないと Node が dist/cjs の `.js` を ESM として読み、
 * `require` で配布する CJS 版が動かない。各 lib の `build` から、lib のディレクトリを cwd として呼ぶ。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.cwd(), 'dist/cjs');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, 'package.json'), `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
console.log('wrote: dist/cjs/package.json');
