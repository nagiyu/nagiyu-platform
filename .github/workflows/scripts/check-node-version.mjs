/**
 * Node のメジャー版が、`.node-version` と各 Dockerfile のベースイメージで揃っているかを検査するスクリプト。
 *
 * Node の版は `.node-version` と Dockerfile の FROM のタグに別々に書かれており、
 * 片方だけ上げても気づけない。基準 (`.node-version` のメジャー) と食い違う Dockerfile を CI で落とす。
 * 版の読み方を知らない外部イメージの FROM は、検査から漏れないよう黙って通さず落とす。
 * npm の依存を増やさないため、Node の標準モジュールだけで書く。
 *
 * 使い方:
 *   node .github/workflows/scripts/check-node-version.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// 実行場所に依存せず、リポジトリ内のファイルを解決するため
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');

const NODE_VERSION_FILE = '.node-version';

/**
 * Node の版をタグに持つことが分かっているイメージ。
 * 正規表現の第 1 グループがタグ全体で、先頭の数字がメジャー版。
 */
const KNOWN_NODE_IMAGES = [
  /^node:(.+)$/,
  /^public\.ecr\.aws\/lambda\/nodejs:(.+)$/,
  /^mcr\.microsoft\.com\/devcontainers\/javascript-node:(.+)$/,
];

const MESSAGES = {
  BASE_UNREADABLE: `${NODE_VERSION_FILE} からメジャー版を読めません (例: 26)`,
  NO_DOCKERFILE: 'Dockerfile が 1 つも見つかりません (検査の対象が空です)',
  MISMATCH: (found, expected) =>
    `Node のメジャー版が ${found} ですが、${NODE_VERSION_FILE} は ${expected} です。` +
    `Node を上げるときは ${NODE_VERSION_FILE} と全 Dockerfile のメジャーをそろえてください。` +
    'CI 共通イメージ (.github/ci-image/Dockerfile) は VERSION を上げて作り直します (手順は docs/development/ci-image.md)',
  UNKNOWN_FROM: (image) =>
    `FROM ${image} から Node の版を読めません。` +
    'Node の版をタグに持つイメージなら check-node-version.mjs の KNOWN_NODE_IMAGES に足してください。' +
    'Node を持たないイメージで Node を入れ直しているなら、同じファイルに ARG NODE_VERSION=<版> を書いてください',
  OK: (count, expected) => `Node ${expected} で ${count} 件の Dockerfile がそろっています`,
  FAILED: (count) => `Node の版が食い違う、または読めない箇所が ${count} 件あります`,
};

/**
 * `.node-version` の内容からメジャー版を取り出す。
 * @param {string} text
 * @returns {string | null}
 */
export function parseBaseMajor(text) {
  const match = text.trim().match(/^v?(\d+)(?:\.\d+)*$/);
  return match ? match[1] : null;
}

/**
 * Dockerfile を読み、Node のメジャー版を持つ行と、読めない FROM 行を集める。
 * @param {string} content Dockerfile の中身
 * @returns {{ found: {line: number, major: string, label: string}[], unknown: {line: number, image: string}[] }}
 */
export function scanDockerfile(content) {
  const lines = content.split(/\r?\n/);
  const hasNodeArg = lines.some((l) => /^\s*ARG\s+NODE_VERSION=\d/i.test(l));
  const stages = new Set();
  const found = [];
  const unknown = [];

  lines.forEach((text, index) => {
    const line = index + 1;

    const arg = text.match(/^\s*ARG\s+NODE_VERSION=v?(\d+)/i);
    if (arg) {
      found.push({ line, major: arg[1], label: `ARG NODE_VERSION=${text.split('=')[1].trim()}` });
      return;
    }

    const from = text.match(/^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i);
    if (!from) return;
    const image = from[1];
    const stage = from[2];
    // 前のステージを指す FROM は、そのステージの FROM で検査済みのため
    const isPreviousStage = stages.has(image.toLowerCase());
    if (stage) stages.add(stage.toLowerCase());
    if (isPreviousStage) return;

    for (const pattern of KNOWN_NODE_IMAGES) {
      const match = image.match(pattern);
      if (!match) continue;
      const major = match[1].match(/^v?(\d+)/);
      if (major) found.push({ line, major: major[1], label: `FROM ${image}` });
      else unknown.push({ line, image });
      return;
    }
    // Node を持たないイメージに公式バイナリを入れ直すファイルは、ARG の版で検査するため
    if (!hasNodeArg) unknown.push({ line, image });
  });

  return { found, unknown };
}

/**
 * 1 つの Dockerfile の検査結果を、エラーメッセージの配列にする。
 * @param {string} path
 * @param {string} content
 * @param {string} expected 基準のメジャー版
 * @returns {{ path: string, line: number, message: string }[]}
 */
export function checkDockerfile(path, content, expected) {
  const { found, unknown } = scanDockerfile(content);
  const errors = [];
  for (const f of found) {
    if (f.major !== expected) {
      errors.push({ path, line: f.line, message: `${f.label}: ${MESSAGES.MISMATCH(f.major, expected)}` });
    }
  }
  for (const u of unknown) {
    errors.push({ path, line: u.line, message: MESSAGES.UNKNOWN_FROM(u.image) });
  }
  return errors;
}

function listDockerfiles() {
  const out = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out
    .split('\n')
    .filter((p) => p === 'Dockerfile' || p.endsWith('/Dockerfile'));
}

function main() {
  const expected = parseBaseMajor(readFileSync(join(REPO_ROOT, NODE_VERSION_FILE), 'utf8'));
  if (!expected) {
    console.error(`::error file=${NODE_VERSION_FILE}::${MESSAGES.BASE_UNREADABLE}`);
    return 1;
  }
  const files = listDockerfiles();
  if (files.length === 0) {
    console.error(`::error::${MESSAGES.NO_DOCKERFILE}`);
    return 1;
  }

  const errors = files.flatMap((path) =>
    checkDockerfile(path, readFileSync(join(REPO_ROOT, path), 'utf8'), expected),
  );
  for (const e of errors) {
    console.error(`::error file=${e.path},line=${e.line}::${e.message}`);
  }
  if (errors.length > 0) {
    console.error(MESSAGES.FAILED(errors.length));
    return 1;
  }
  console.log(MESSAGES.OK(files.length, expected));
  return 0;
}

// テストから import したときに検査を走らせないため
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
