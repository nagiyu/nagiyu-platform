#!/usr/bin/env node
/**
 * 仕様カード (docs/specs/**) のソースハッシュを計算・検証するスクリプト。
 *
 * カードはコードの写しで、正本ではない。カードが今のコードと食い違っていないかを、
 * sources に挙げたファイルの中身のハッシュで機械的に確かめる。
 * npm の依存を増やさないため、Node の標準モジュールだけで書く。
 *
 * 使い方:
 *   node .github/workflows/scripts/spec-cards.mjs update [card...]
 *   node .github/workflows/scripts/spec-cards.mjs check
 *
 * card にはカードの id (例: livetalk/batch/acquire) かファイルのパスを渡す。
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// 実行場所に依存せず、sources のパスをリポジトリルートから解決するため
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const DOCS_DIR = join(REPO_ROOT, 'docs');
const SPECS_DIR = join(DOCS_DIR, 'specs');

const KINDS = ['batch', 'flow', 'term', 'screen', 'api'];
const REQUIRED_FIELDS = ['id', 'title', 'kind', 'service', 'sources', 'sources_hash'];

const MESSAGES = {
  USAGE:
    '使い方: node .github/workflows/scripts/spec-cards.mjs <update [card...] | check>\n' +
    '  update: sources_hash を計算して書き戻す (card 省略時は全カード)\n' +
    '  check : 全カードの整合を確かめる (ずれがあれば exit 1)',
  NO_FRONTMATTER_END: 'frontmatter の終わり (---) が見つかりません',
  INVALID_LINE: (line) => `frontmatter の行を解釈できません: ${line}`,
  CARD_NOT_FOUND: (arg) => `カードが見つかりません: ${arg}`,
};

/**
 * frontmatter を持つ .md だけをカードとみなして列挙する。
 * README.md のように frontmatter を持たない文書は対象外にする。
 *
 * @returns リポジトリルートからの絶対パスの配列 (ソート済み)
 */
function listCardFiles() {
  if (!existsSync(SPECS_DIR)) return [];
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.md')) files.push(full);
    }
  };
  walk(SPECS_DIR);
  return files
    .filter((file) => normalizeNewlines(readFileSync(file, 'utf8')).startsWith('---\n'))
    .sort();
}

/** CRLF を LF にそろえる。改行コードの違いでハッシュがぶれないようにするため */
function normalizeNewlines(text) {
  return text.replace(/\r\n/g, '\n');
}

/** 引用符で囲まれていればはずし、そうでなければ末尾のコメントを落とす */
function parseScalar(raw) {
  const value = raw.trim();
  const quoted = value.match(/^(["'])(.*)\1$/);
  if (quoted) return quoted[2];
  return value.replace(/\s+#.*$/, '').trim();
}

/** `[a, b]` 形式のインライン配列を配列にする */
function parseInlineArray(raw) {
  const inner = raw.trim().replace(/\s+#.*$/, '').trim().slice(1, -1).trim();
  if (inner === '') return [];
  return inner.split(',').map((item) => parseScalar(item));
}

/**
 * カードの frontmatter を読む。対応するのはスカラー・`[a, b]`・`- ` のブロック配列だけ。
 *
 * @returns fields (キー → 値)、lines (全行)、bodyStart (frontmatter 直後の行番号)、
 *   keyRanges (キー → [開始行, 終了行の次]。書き戻し位置の特定に使う)
 */
function parseFrontmatter(text) {
  const lines = normalizeNewlines(text).split('\n');
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end === -1) throw new Error(MESSAGES.NO_FRONTMATTER_END);

  const fields = {};
  const keyRanges = {};
  let currentKey = null;
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && currentKey !== null && Array.isArray(fields[currentKey])) {
      fields[currentKey].push(parseScalar(item[1]));
      keyRanges[currentKey][1] = i + 1;
      continue;
    }

    const pair = line.match(/^([A-Za-z_][\w-]*):(?:\s+(.*)|\s*)$/);
    if (!pair) throw new Error(MESSAGES.INVALID_LINE(line));
    const [, key, rest = ''] = pair;
    currentKey = key;
    keyRanges[key] = [i, i + 1];
    if (rest.trim() === '') fields[key] = [];
    else if (rest.trim().startsWith('[')) fields[key] = parseInlineArray(rest);
    else fields[key] = parseScalar(rest);
  }
  return { fields, lines, keyRanges, end };
}

/**
 * sources のハッシュを求める。
 * パスでソートし、各ファイルの「パス + 改行 + 中身 (LF 正規化)」を連結して sha256 にする。
 *
 * @throws sources のファイルが読めないとき
 */
function computeSourcesHash(sources) {
  const hash = createHash('sha256');
  for (const path of [...sources].sort()) {
    const content = normalizeNewlines(readFileSync(join(REPO_ROOT, path), 'utf8'));
    hash.update(`${path}\n${content}`);
  }
  return hash.digest('hex');
}

/** カードのファイルパスから、docs/specs/ からの相対パス (.md なし) を求める */
function expectedId(file) {
  return relative(SPECS_DIR, file).split(sep).join('/').replace(/\.md$/, '');
}

/** 全カードを読む。読めないカードは errors に積む */
function loadCards() {
  const cards = [];
  const errors = [];
  for (const file of listCardFiles()) {
    const label = relative(REPO_ROOT, file).split(sep).join('/');
    try {
      const parsed = parseFrontmatter(readFileSync(file, 'utf8'));
      cards.push({ file, label, ...parsed });
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }
  return { cards, errors };
}

function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * related_adr (docs/ からの相対パス + アンカー) が実在する節を指しているかを確かめる。
 * アンカーは見出しの先頭の語 (節番号 2.24 や ADR-003) で、見出しの全文ではない。
 * 見出しの文言を直しても参照が壊れないようにするため。
 *
 * @returns 問題の説明。問題がなければ null
 */
function validateAdrRef(ref) {
  const [path, anchor] = ref.split('#');
  const file = join(DOCS_DIR, path);
  if (!existsSync(file) || statSync(file).isDirectory()) return 'ファイルがありません';
  if (anchor === undefined || anchor === '') return null;
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^#{1,6}\\s+${escaped}(?=[\\s:]|$)`, 'm');
  if (!heading.test(normalizeNewlines(readFileSync(file, 'utf8')))) {
    return `見出しが ${anchor} で始まる節がありません`;
  }
  return null;
}

/** 1 枚のカードの問題を日本語で列挙する。問題がなければ空配列 */
function validateCard(card, knownIds) {
  const { fields, label, file } = card;
  const problems = [];

  for (const key of REQUIRED_FIELDS) {
    const value = fields[key];
    const missing = value === undefined || (key !== 'sources' && value === '');
    if (missing) problems.push(`必須項目 ${key} がありません`);
  }

  const id = expectedId(file);
  if (fields.id && fields.id !== id) {
    problems.push(`id (${fields.id}) がファイルの位置 (${id}) と一致しません`);
  }
  const segments = id.split('/');
  if (segments.length !== 3) {
    problems.push(`配置は docs/specs/{service}/{kind}/{name}.md にしてください (今: ${id})`);
  } else {
    if (fields.service && fields.service !== segments[0]) {
      problems.push(`service (${fields.service}) がディレクトリ (${segments[0]}) と一致しません`);
    }
    if (fields.kind && fields.kind !== segments[1]) {
      problems.push(`kind (${fields.kind}) がディレクトリ (${segments[1]}) と一致しません`);
    }
  }
  if (fields.kind && !KINDS.includes(fields.kind)) {
    problems.push(`kind (${fields.kind}) は ${KINDS.join(' / ')} のいずれかにしてください`);
  }

  for (const key of ['terms', 'related_cards']) {
    for (const ref of asArray(fields[key])) {
      if (!knownIds.has(ref)) problems.push(`${key} の ${ref} に対応するカードがありません`);
    }
  }

  for (const ref of asArray(fields.related_adr)) {
    const problem = validateAdrRef(ref);
    if (problem) problems.push(`related_adr の ${ref}: ${problem}`);
  }

  const sources = asArray(fields.sources);
  let sourcesReadable = true;
  for (const path of sources) {
    // Next.js の動的ルート (`[id]` など) は実在するファイル名なので、`[` `]` は glob として扱わない。
    // glob のつもりの `[abc]` は、次の存在確認で落ちる
    if (/[*?{}]/.test(path)) {
      problems.push(`sources には glob を書けません (ファイルのパスを列挙してください): ${path}`);
      sourcesReadable = false;
    } else if (!existsSync(join(REPO_ROOT, path)) || statSync(join(REPO_ROOT, path)).isDirectory()) {
      problems.push(`sources のファイルがありません: ${path}`);
      sourcesReadable = false;
    }
  }

  if (sourcesReadable && fields.sources !== undefined && fields.sources_hash) {
    const actual = computeSourcesHash(sources);
    if (actual !== fields.sources_hash) {
      problems.push(
        'sources のコードが、カードを作ったときから変わっています ' +
          `(sources_hash が一致しません)。本文が今のコードと合っているかを確かめ、必要なら直してから update してください。\n` +
          `      カードの値: ${fields.sources_hash}\n      今のコード: ${actual}`
      );
    }
  }

  return problems.map((message) => `${label}: ${message}`);
}

function runCheck() {
  const { cards, errors } = loadCards();
  const knownIds = new Set(cards.map((card) => expectedId(card.file)));
  const problems = [...errors];
  for (const card of cards) problems.push(...validateCard(card, knownIds));

  if (problems.length > 0) {
    console.error(`仕様カードに ${problems.length} 件の問題があります。`);
    for (const problem of problems) console.error(`❌ ${problem}`);
    return 1;
  }
  console.log(`✅ 仕様カード ${cards.length} 枚、問題なし`);
  return 0;
}

/** 引数 (id かパス) をカードのファイルに解決する */
function resolveCardArg(arg, cards) {
  const byId = cards.find((card) => expectedId(card.file) === arg.replace(/\.md$/, ''));
  if (byId) return byId;
  const absolute = [resolve(process.cwd(), arg), resolve(REPO_ROOT, arg)];
  return cards.find((card) => absolute.includes(card.file));
}

function runUpdate(args) {
  const { cards, errors } = loadCards();
  if (errors.length > 0) {
    for (const error of errors) console.error(`❌ ${error}`);
    return 1;
  }

  const targets = [];
  let failed = false;
  if (args.length === 0) targets.push(...cards);
  for (const arg of args) {
    const card = resolveCardArg(arg, cards);
    if (card) targets.push(card);
    else {
      console.error(`❌ ${MESSAGES.CARD_NOT_FOUND(arg)}`);
      failed = true;
    }
  }

  for (const card of targets) {
    const sources = asArray(card.fields.sources);
    const missing = sources.filter((path) => !existsSync(join(REPO_ROOT, path)));
    if (missing.length > 0) {
      console.error(`❌ ${card.label}: sources のファイルがありません: ${missing.join(', ')}`);
      failed = true;
      continue;
    }

    const hash = computeSourcesHash(sources);
    const lines = [...card.lines];
    const newLine = `sources_hash: ${hash}`;
    if (card.keyRanges.sources_hash) {
      const [start] = card.keyRanges.sources_hash;
      if (lines[start] === newLine) {
        console.log(`変更なし: ${card.label}`);
        continue;
      }
      lines[start] = newLine;
    } else {
      // sources の直後に置くと、見本の項目順と一致する
      const insertAt = card.keyRanges.sources ? card.keyRanges.sources[1] : card.end;
      lines.splice(insertAt, 0, newLine);
    }
    writeFileSync(card.file, lines.join('\n'));
    console.log(`更新: ${card.label}`);
  }
  return failed ? 1 : 0;
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'check') return runCheck();
  if (command === 'update') return runUpdate(args);
  console.error(MESSAGES.USAGE);
  return 1;
}

process.exit(main());
