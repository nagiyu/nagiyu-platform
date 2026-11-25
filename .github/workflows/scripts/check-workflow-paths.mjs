/**
 * GitHub Actions の workflow の `paths` に、実行に要るファイルの漏れが無いかを検査するスクリプト。
 *
 * `paths` は workflow 間で共有できず、各 workflow が手で持っている。
 * composite action や tsconfig の継承元のような共有のファイルを入れ忘れると、
 * そのファイルを変えても workflow が走らず、CI は赤くならないので気づけない。
 * そこで workflow の中身から `paths` に要るファイルを導き、どのパターンにも当たらないものを CI で落とす。
 * 読めない書き方 (否定パターン、`paths-ignore`、未対応のグロブ等) は、検査から漏れないよう黙って通さず落とす。
 * npm の依存を増やさないため、Node の標準モジュールだけで書く。
 *
 * 辿らないもの (導けない参照は、検査の対象外であることを承知して使う):
 * - `.github/scripts/*.sh` や `.github/workflows/scripts/*` が別のスクリプトを呼んでいても、その先は辿らない。
 *   シェルの呼び出しは変数展開や条件分岐で決まり、静的には正しく導けず、誤検知のほうが害になるため
 * - tsconfig の `extends` は、paths が `infra/<x>/**`・`services/<x>/**` の形のときだけ辿る。
 *   libs は利用側の workflow が `libs/**` をまとめて持ち、個別の継承元を並べる運用ではないため
 *
 * 使い方:
 *   node .github/workflows/scripts/check-workflow-paths.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// 実行場所に依存せず、リポジトリ内のファイルを解決するため
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');

const WORKFLOWS_DIR = '.github/workflows';
const ACTIONS_DIR = '.github/actions';
const NODE_VERSION_FILE = '.node-version';

/** `paths` を検査する対象のイベント */
const TARGET_EVENTS = ['push', 'pull_request', 'pull_request_target'];

/** tsconfig を集めるときに潜らない、生成物・依存のディレクトリ */
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.next', 'cdk.out', 'build', 'coverage', '.turbo']);

/**
 * 意図して `paths` から外すもの。当たるものは要るものから除く。
 * 実際には不要になった項目は、古い除外として落とす。
 * @type {{ workflow: string, path: string, reason: string }[]}
 */
export const EXCLUSIONS = [];

const OWN_FILE_VIA = ['ワークフロー自身'];
const BODY_VIA = ['ワークフロー本体'];

const MESSAGES = {
  ON_UNREADABLE: (file) => `${file}: トリガー (on:) を読めません`,
  INLINE_PATHS: (file, event) =>
    `${file}: ${event} の paths が 1 行の書き方 (インライン) です。1 行 1 パターンのリストで書いてください`,
  UNSUPPORTED_KEY: (file, event, key) =>
    `${file}: ${event} の ${key} は検査で扱えません。paths のリストだけで絞ってください`,
  UNSUPPORTED_ITEM: (file, event, item) =>
    `${file}: ${event} の paths の項目 ${item} を読めません。クォートした文字列を 1 行 1 つで書いてください`,
  NEGATED_PATTERN: (file, event, pattern) =>
    `${file}: ${event} の paths の否定パターン ${pattern} は検査で扱えません`,
  UNSUPPORTED_GLOB: (file, event, pattern) =>
    `${file}: ${event} の paths のパターン ${pattern} は、検査が扱えない記法を含みます (扱えるのは **, *, 文字どおりの文字だけ)`,
  MISSING_ACTION: (file, name) => `${file}: .github/actions/${name} を参照していますが、存在しません`,
  MISSING_REUSABLE: (file, path) => `${file}: ${path} を参照していますが、存在しません`,
  TSCONFIG_UNREADABLE: (path, reason) => `${path}: tsconfig を JSON として読めません (${reason})`,
  TSCONFIG_EXTENDS_MISSING: (path, target) => `${path}: extends の ${target} が存在しません`,
  STALE_EXCLUSION: (e) =>
    `除外 { workflow: ${e.workflow}, path: ${e.path} } は不要です。` +
    '該当する workflow が無いか、除かなくても paths に当たっています。check-workflow-paths.mjs の EXCLUSIONS から消してください',
  NO_WORKFLOW: '検査の対象 (paths を持つ workflow) が 1 つもありません',
  MISSING_HEADER: (file, event, count) =>
    `${file} の ${event} の paths に、足すべきパスが ${count} 件あります`,
  MISSING_ITEM: (path, via) => `  - ${path}  (要る理由: ${via.join(' → ')})`,
  OK: (count) => `${count} 件の workflow の paths に、漏れはありません`,
  FAILED: (count) => `paths の漏れ、または読めない箇所が ${count} 件あります`,
};

/**
 * 行末のコメントを、クォートの中を避けて取り除く。
 * @param {string} line
 * @returns {string}
 */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

const indentOf = (line) => line.length - line.trimStart().length;

/**
 * workflow の `on:` から、push / pull_request の `paths` のリストを読む。
 * 行ベースで必要な所だけ読み、読めない形は errors に積む。
 * @param {string} file メッセージ用のファイル名
 * @param {string} content workflow の中身
 * @returns {{ events: { event: string, patterns: string[] }[], errors: string[] }}
 */
export function parsePaths(file, content) {
  const lines = content.split(/\r?\n/).map(stripComment);
  const onIndex = lines.findIndex((l) => /^(?:on|"on"|'on')\s*:/.test(l));
  if (onIndex === -1) return { events: [], errors: [MESSAGES.ON_UNREADABLE(file)] };

  const inline = lines[onIndex].slice(lines[onIndex].indexOf(':') + 1).trim();
  if (inline !== '') {
    // `on: push` や `on: [push]` は paths を持てない。フロー形式の paths だけは読めないので落とす
    if (/paths/.test(inline)) return { events: [], errors: [MESSAGES.ON_UNREADABLE(file)] };
    return { events: [], errors: [] };
  }

  const block = [];
  for (let i = onIndex + 1; i < lines.length; i++) {
    if (lines[i].trim() !== '' && indentOf(lines[i]) === 0) break;
    block.push(lines[i]);
  }
  const body = block.filter((l) => l.trim() !== '');
  if (body.length === 0) return { events: [], errors: [] };
  const eventIndent = indentOf(body[0]);

  const events = [];
  const errors = [];
  for (let i = 0; i < block.length; i++) {
    const head = block[i].match(/^(\s*)([\w-]+)\s*:(.*)$/);
    if (!head || head[1].length !== eventIndent || !TARGET_EVENTS.includes(head[2])) continue;
    const event = head[2];
    if (head[3].trim() !== '') {
      if (/paths/.test(head[3])) errors.push(MESSAGES.INLINE_PATHS(file, event));
      continue;
    }

    let end = i + 1;
    while (end < block.length && (block[end].trim() === '' || indentOf(block[end]) > eventIndent)) end++;
    const range = block.slice(i + 1, end);
    const inner = range.filter((l) => l.trim() !== '');
    if (inner.length === 0) continue;
    const innerIndent = indentOf(inner[0]);

    let patterns = null;
    for (let j = 0; j < range.length; j++) {
      const key = range[j].match(/^(\s*)(paths(?:-ignore)?)\s*:(.*)$/);
      if (!key || key[1].length !== innerIndent) continue;
      if (key[2] === 'paths-ignore') {
        errors.push(MESSAGES.UNSUPPORTED_KEY(file, event, 'paths-ignore'));
        continue;
      }
      if (key[3].trim() !== '') {
        errors.push(MESSAGES.INLINE_PATHS(file, event));
        continue;
      }
      patterns = [];
      for (let k = j + 1; k < range.length; k++) {
        const text = range[k].trim();
        if (text === '') continue;
        if (!text.startsWith('-') || indentOf(range[k]) < innerIndent) break;
        const value = text.slice(1).trim();
        const quoted = value.match(/^(['"])(.*)\1$/);
        const item = quoted ? quoted[2] : value;
        if (item === '' || (!quoted && /^[[\]{}&*|>!]/.test(value) && !value.startsWith('!'))) {
          errors.push(MESSAGES.UNSUPPORTED_ITEM(file, event, value));
        } else {
          patterns.push(item);
        }
      }
    }
    if (patterns) events.push({ event, patterns });
  }
  return { events, errors };
}

/**
 * paths のグロブを正規表現にする。扱えない記法は例外にする。
 * @param {string} pattern
 * @returns {RegExp}
 */
export function globToRegExp(pattern) {
  if (pattern.startsWith('!')) throw new Error('negated');
  let re = '';
  let i = 0;
  while (i < pattern.length) {
    const rest = pattern.slice(i);
    if (rest.startsWith('**/')) {
      re += '(?:[^/]+/)*';
      i += 3;
    } else if (rest === '**' && (i === 0 || pattern[i - 1] === '/')) {
      // 末尾の `dir/**` は dir 配下のすべてで、dir 自体 (ファイルではない) は含まない
      re += i === 0 ? '.*' : '.+';
      i += 2;
    } else if (rest.startsWith('**')) {
      throw new Error('unsupported');
    } else if (rest[0] === '*') {
      re += '[^/]*';
      i += 1;
    } else if (/[?[\]{}()+!\\]/.test(rest[0])) {
      // `?` は GitHub では「直前の 1 文字が 0 か 1 回」を表し、一般のグロブと意味が違うため扱わない
      throw new Error('unsupported');
    } else {
      re += rest[0].replace(/[.^$|]/g, '\\$&');
      i += 1;
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * workflow / action の中身から、辿るべき参照を集める。
 * @param {string} content
 * @returns {{ actions: string[], reusables: string[], scripts: string[], nodeVersion: boolean }}
 */
export function scanReferences(content) {
  const text = content
    .split(/\r?\n/)
    .map(stripComment)
    .join('\n');
  const unique = (re, group) => [...new Set([...text.matchAll(re)].map((m) => m[group]))];
  return {
    actions: unique(/uses:\s*['"]?\.\/\.github\/actions\/([\w.-]+)/g, 1),
    reusables: unique(/uses:\s*['"]?\.\/\.github\/workflows\/([\w.-]+\.ya?ml)/g, 1),
    // 直前が `/` の参照は別のパスの一部なので除くが、ワークスペース変数に続く `/` だけは拾う
    scripts: unique(
      /(?:^|[^\w/.-]|\$GITHUB_WORKSPACE\/|\$\{GITHUB_WORKSPACE\}\/|\$\{\{\s*github\.workspace\s*\}\}\/)(?:\.\/)?(\.github\/(?:workflows\/)?scripts\/[\w.-]+(?:\/[\w.-]+)*)/g,
      1,
    ),
    nodeVersion: /node-version-file:\s*['"]?\.node-version['"]?(?:\s|$)/.test(text),
  };
}

/**
 * ディレクトリ配下のファイルを、リポジトリ相対のパスで集める。
 * @param {string} root
 * @param {string} dir リポジトリ相対
 * @returns {string[]}
 */
function listFiles(root, dir) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    if (IGNORED_DIRS.has(entry.name)) return [];
    const rel = posix.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(root, rel) : [rel];
  });
}

/**
 * workflow から辿れる action・reusable workflow・スクリプト等、paths に要るファイルを集める。
 * @param {string} root
 * @param {string} workflowPath リポジトリ相対
 * @param {string} content
 * @returns {{ requirements: Map<string, string[]>, errors: string[] }}
 */
export function collectRequirements(root, workflowPath, content) {
  const requirements = new Map();
  const errors = [];
  const add = (path, via) => {
    if (!requirements.has(path)) requirements.set(path, via);
  };
  const visited = new Set();

  add(workflowPath, OWN_FILE_VIA);

  const walk = (text, chain) => {
    const refs = scanReferences(text);
    const via = (label) => [...chain, label];

    for (const name of refs.actions) {
      const key = `action:${name}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const dir = `${ACTIONS_DIR}/${name}`;
      const files = listFiles(root, dir);
      if (files.length === 0) {
        errors.push(MESSAGES.MISSING_ACTION(workflowPath, name));
        continue;
      }
      for (const file of files) add(file, via(name));
      const manifest = files.find((f) => /\/action\.ya?ml$/.test(f));
      if (manifest) walk(readFileSync(join(root, manifest), 'utf8'), via(name));
    }

    for (const name of refs.reusables) {
      const key = `workflow:${name}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const path = `${WORKFLOWS_DIR}/${name}`;
      if (!existsSync(join(root, path))) {
        errors.push(MESSAGES.MISSING_REUSABLE(workflowPath, path));
        continue;
      }
      add(path, via(name));
      walk(readFileSync(join(root, path), 'utf8'), via(name));
    }

    for (const script of refs.scripts) add(script, chain.length ? chain : BODY_VIA);
    if (refs.nodeVersion) add(NODE_VERSION_FILE, chain.length ? chain : BODY_VIA);
  };
  walk(content, []);
  return { requirements, errors };
}

/**
 * tsconfig の JSON を読む。tsc が許す行コメント・ブロックコメント・末尾カンマを取り除く。
 * 文字列リテラルの中の `//` や `/*` (URL、`"@/*"` 等) は壊さない。
 * @param {string} text
 * @returns {any}
 */
export function parseTsconfig(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  // 文字列の外の `,` の直後が閉じ括弧なら末尾カンマ
  let result = '';
  let inString = false;
  for (let k = 0; k < out.length; k++) {
    const c = out[k];
    if (inString) {
      result += c;
      if (c === '\\') result += out[++k] ?? '';
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      result += c;
    } else if (c === ',' && /^\s*[}\]]/.test(out.slice(k + 1))) {
      continue;
    } else {
      result += c;
    }
  }
  return JSON.parse(result);
}

/**
 * ディレクトリ配下の tsconfig の `extends` を相対パスで辿り、ディレクトリの外にある継承元を集める。
 * @param {string} root
 * @param {string} dir リポジトリ相対
 * @returns {{ requirements: Map<string, string[]>, errors: string[] }}
 */
export function collectTsconfigRequirements(root, dir) {
  const requirements = new Map();
  const errors = [];
  const visited = new Set();

  const follow = (file) => {
    if (visited.has(file)) return;
    visited.add(file);
    let config;
    try {
      config = parseTsconfig(readFileSync(join(root, file), 'utf8'));
    } catch (e) {
      errors.push(MESSAGES.TSCONFIG_UNREADABLE(file, e.message));
      return;
    }
    const list = [].concat(config.extends ?? []);
    for (const target of list) {
      // パッケージ名の extends は、リポジトリ内のファイルではないため辿らない
      if (typeof target !== 'string' || !target.startsWith('.')) continue;
      const base = posix.normalize(posix.join(posix.dirname(file), target));
      const resolved = [base, `${base}.json`].find((p) => p.endsWith('.json') && existsSync(join(root, p)));
      if (!resolved) {
        errors.push(MESSAGES.TSCONFIG_EXTENDS_MISSING(file, target));
        continue;
      }
      if (!resolved.startsWith(`${dir}/`) && !requirements.has(resolved)) {
        requirements.set(resolved, [`tsconfig の extends: ${file} → ${resolved}`]);
      }
      follow(resolved);
    }
  };

  for (const file of listFiles(root, dir)) {
    if (/^tsconfig.*\.json$/.test(basename(file))) follow(file);
  }
  return { requirements, errors };
}

/**
 * 全 workflow の paths を検査する。
 * @param {string} root リポジトリのルート
 * @param {{ workflow: string, path: string, reason: string }[]} [exclusions]
 * @returns {{ targets: number, missing: { workflow: string, event: string, path: string, via: string[] }[], problems: string[] }}
 */
export function checkRepository(root, exclusions = EXCLUSIONS) {
  const files = readdirSync(join(root, WORKFLOWS_DIR))
    .filter((f) => /\.ya?ml$/.test(f))
    .sort();
  const problems = [];
  const missing = [];
  const needed = new Set();
  let targets = 0;

  for (const name of files) {
    const workflowPath = `${WORKFLOWS_DIR}/${name}`;
    const content = readFileSync(join(root, workflowPath), 'utf8');
    const parsed = parsePaths(workflowPath, content);
    problems.push(...parsed.errors);
    if (parsed.events.length === 0) continue;
    targets++;

    const base = collectRequirements(root, workflowPath, content);
    problems.push(...base.errors);

    for (const { event, patterns } of parsed.events) {
      const matchers = [];
      for (const pattern of patterns) {
        try {
          matchers.push(globToRegExp(pattern));
        } catch (e) {
          problems.push(
            e.message === 'negated'
              ? MESSAGES.NEGATED_PATTERN(workflowPath, event, pattern)
              : MESSAGES.UNSUPPORTED_GLOB(workflowPath, event, pattern),
          );
        }
      }
      // パターンを読めないと当たり判定が偽の漏れを出すため、そのイベントはここで打ち切る
      if (matchers.length !== patterns.length) continue;

      const requirements = new Map(base.requirements);
      for (const pattern of patterns) {
        const m = pattern.match(/^((?:infra|services)\/[^*?[\]{}]+?)\/\*\*$/);
        if (!m) continue;
        const ts = collectTsconfigRequirements(root, m[1]);
        problems.push(...ts.errors);
        for (const [path, via] of ts.requirements) {
          if (!requirements.has(path)) requirements.set(path, via);
        }
      }

      for (const [path, via] of requirements) {
        if (matchers.some((re) => re.test(path))) continue;
        needed.add(`${name}\0${path}`);
        if (exclusions.some((e) => e.workflow === name && e.path === path)) continue;
        missing.push({ workflow: workflowPath, event, path, via });
      }
    }
  }

  for (const e of exclusions) {
    if (!needed.has(`${e.workflow}\0${e.path}`)) problems.push(MESSAGES.STALE_EXCLUSION(e));
  }
  if (targets === 0) problems.push(MESSAGES.NO_WORKFLOW);
  return { targets, missing, problems };
}

function main() {
  const { targets, missing, problems } = checkRepository(REPO_ROOT);

  const groups = new Map();
  for (const m of missing) {
    const key = `${m.workflow}\0${m.event}`;
    if (!groups.has(key)) groups.set(key, { workflow: m.workflow, event: m.event, items: [] });
    groups.get(key).items.push(m);
  }
  for (const g of groups.values()) {
    console.error(`::error file=${g.workflow}::${MESSAGES.MISSING_HEADER(g.workflow, g.event, g.items.length)}`);
    for (const m of g.items) console.error(MESSAGES.MISSING_ITEM(m.path, m.via));
  }
  for (const p of problems) console.error(`::error::${p}`);

  const count = missing.length + problems.length;
  if (count > 0) {
    console.error(MESSAGES.FAILED(count));
    return 1;
  }
  console.log(MESSAGES.OK(targets));
  return 0;
}

// テストから import したときに検査を走らせないため
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
