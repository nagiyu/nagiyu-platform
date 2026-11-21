/**
 * docs/ の配置と出典を検査するスクリプト。
 *
 * docs/ の文書は、docs/layout.json の patterns のどれかに置く。
 * 旧配置 (legacy) の文書は、移すまで従来どおりの検査だけを受ける。
 * 文書はコードの写しになりうるため、frontmatter の sources に挙げたファイルの
 * 中身のハッシュで、今のコードと食い違っていないかを機械的に確かめる。
 * npm の依存を増やさないため、Node の標準モジュールだけで書く。
 *
 * 使い方:
 *   node .github/workflows/scripts/docs-structure.mjs update [path|id...]
 *   node .github/workflows/scripts/docs-structure.mjs check [--forbid-unimplemented]
 *
 * update の引数には文書のファイルのパスか、旧カードの id (例: livetalk/batch/acquire) を渡す。
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
const LAYOUT_FILE = join(DOCS_DIR, 'layout.json');

const KINDS = ['batch', 'flow', 'term', 'screen', 'api'];
const REQUIRED_FIELDS = ['id', 'title', 'kind', 'service', 'sources', 'sources_hash'];

const NEW_DOC_KEYS = ['sources', 'sources_hash', 'unimplemented'];

const MESSAGES = {
  USAGE:
    '使い方: node .github/workflows/scripts/docs-structure.mjs <update [path|id...] | check [--forbid-unimplemented]>\n' +
    '  update: sources_hash を計算して書き戻す (引数省略時は出典を持つ全文書)\n' +
    '  check : docs の配置と出典の整合を確かめる (ずれがあれば exit 1)\n' +
    '          --forbid-unimplemented: unimplemented: true の文書もエラーにする',
  NO_FRONTMATTER_END: 'frontmatter の終わり (---) が見つかりません',
  INVALID_LINE: (line) => `frontmatter の行を解釈できません: ${line}`,
  DOC_NOT_FOUND: (arg) => `文書が見つかりません: ${arg}`,
  NOT_IN_LAYOUT:
    'docs/layout.json の配置に当たらず、legacy にも載っていません (配置の patterns に沿った場所に置いてください)',
  LEGACY_MISSING: (path) => `legacy に載っていますがファイルがありません (行を消してください): ${path}`,
  PLACEHOLDER_DIR_MISSING: (dir, value) =>
    `配置の ${dir}/${value} に対応するディレクトリがリポジトリにありません`,
  NO_FRONTMATTER: 'frontmatter がありません (sources が必須です)',
  UNKNOWN_KEY: (key) => `frontmatter のキー ${key} は使えません (使えるのは ${NEW_DOC_KEYS.join(' / ')})`,
  SOURCES_REQUIRED: 'sources がありません (出典が無い文書は sources: [] と書いてください)',
  SOURCES_NOT_ARRAY: 'sources は配列にしてください',
  HASH_REQUIRED: 'sources が空でないので sources_hash が必要です (update で計算できます)',
  HASH_FORBIDDEN: 'sources が空の文書に sources_hash は書けません',
  UNIMPLEMENTED_VALUE: 'unimplemented は true のときだけ書けます',
  UNIMPLEMENTED_FORBIDDEN:
    'unimplemented: true の文書は develop / master に入れられません (実装されてから入れてください)',
  HASH_MISMATCH: (expected, actual) =>
    'sources のコードが、文書を作ったときから変わっています ' +
    '(sources_hash が一致しません)。本文が今のコードと合っているかを確かめ、必要なら直してから update してください。\n' +
    `      文書の値: ${expected}\n      今のコード: ${actual}`,
};

/** docs/ 配下のすべての .md を、docs/ からの相対パス (/ 区切り) で列挙する (ソート済み) */
function listDocFiles() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.md')) files.push(relative(DOCS_DIR, full).split(sep).join('/'));
    }
  };
  walk(DOCS_DIR);
  return files.sort();
}

/** 配置の定義を読む */
function loadLayout() {
  return JSON.parse(readFileSync(LAYOUT_FILE, 'utf8'));
}

/**
 * patterns のセグメント (`<name>.md` など) を正規表現にする。
 * プレースホルダは / を含まない 1 セグメント以上の文字列に当たる。
 */
function compileSegment(segment) {
  const names = [];
  const source = segment
    .split(/(<[a-z]+>)/)
    .map((part) => {
      const placeholder = part.match(/^<([a-z]+)>$/);
      if (placeholder) {
        names.push(placeholder[1]);
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return { regex: new RegExp(`^${source}$`), names };
}

/**
 * docs/ からの相対パスが、配置の patterns のどれかに当たるかを調べる。
 * placeholders に載っているプレースホルダは、リポジトリルートに同名のディレクトリがあることも確かめる。
 * 雛形は、そのディレクトリが実在しない前提で配置にだけ当てる。
 *
 * @returns { matched, isTemplate, problem }。problem は当たったがディレクトリが無いときの説明
 */
function matchLayout(path, layout) {
  const parts = path.split('/');
  const [templateDir, templateName] = layout.template.split('/');
  for (const pattern of layout.patterns) {
    const compiled = pattern.split('/').map(compileSegment);
    if (compiled.length !== parts.length) continue;
    const captured = {};
    let ok = true;
    for (let i = 0; i < compiled.length && ok; i++) {
      const m = parts[i].match(compiled[i].regex);
      if (!m) ok = false;
      else compiled[i].names.forEach((name, j) => (captured[name] = m[j + 1]));
    }
    if (!ok) continue;

    let isTemplate = false;
    for (const [name, dir] of Object.entries(layout.placeholders)) {
      const value = captured[name];
      if (value === undefined) continue;
      if (dir === templateDir && value === templateName) {
        isTemplate = true;
        continue;
      }
      const target = join(REPO_ROOT, dir, value);
      if (!existsSync(target) || !statSync(target).isDirectory()) {
        return { matched: false, isTemplate: false, problem: MESSAGES.PLACEHOLDER_DIR_MISSING(dir, value) };
      }
    }
    return { matched: true, isTemplate, problem: null };
  }
  return { matched: false, isTemplate: false, problem: null };
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

/**
 * 文書を種別に仕分けして読む。
 * legacyCards: legacy のうち docs/specs/ 配下で frontmatter を持つもの (旧カード)
 * newDocs: 新しい配置の文書 (雛形を除く)
 * errors: 配置・読み取りの問題
 */
function loadDocs(layout) {
  const legacy = new Set(layout.legacy);
  const legacyCards = [];
  const newDocs = [];
  const errors = [];

  for (const path of layout.legacy) {
    if (!existsSync(join(DOCS_DIR, path))) errors.push(`docs/${path}: ${MESSAGES.LEGACY_MISSING(path)}`);
  }

  for (const path of listDocFiles()) {
    const file = join(DOCS_DIR, path);
    const label = `docs/${path}`;
    try {
      if (legacy.has(path)) {
        if (!path.startsWith('specs/')) continue;
        const text = readFileSync(file, 'utf8');
        if (!normalizeNewlines(text).startsWith('---\n')) continue;
        legacyCards.push({ file, label, ...parseFrontmatter(text) });
        continue;
      }
      const { matched, isTemplate, problem } = matchLayout(path, layout);
      if (!matched) {
        errors.push(`${label}: ${problem ?? MESSAGES.NOT_IN_LAYOUT}`);
        continue;
      }
      if (isTemplate) continue;
      newDocs.push({ file, label, parsed: parseFrontmatter(readFileSync(file, 'utf8')) });
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }
  return { legacyCards, newDocs, errors };
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

/**
 * sources の実在・glob 禁止・ハッシュ一致を確かめる。
 * sources_hash がない場合の要否は呼び出し側が判断する。
 */
function validateSources(fields, hashMismatch) {
  const problems = [];
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
    if (actual !== fields.sources_hash) problems.push(hashMismatch(fields.sources_hash, actual));
  }
  return problems;
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

  problems.push(...validateSources(fields, MESSAGES.HASH_MISMATCH));

  return problems.map((message) => `${label}: ${message}`);
}

/** 新しい配置の文書の問題を日本語で列挙する。問題がなければ空配列 */
function validateNewDoc(doc, forbidUnimplemented) {
  const { label, parsed } = doc;
  if (parsed === null) return [`${label}: ${MESSAGES.NO_FRONTMATTER}`];
  const { fields } = parsed;
  const problems = [];

  for (const key of Object.keys(fields)) {
    if (!NEW_DOC_KEYS.includes(key)) problems.push(MESSAGES.UNKNOWN_KEY(key));
  }

  if (fields.sources === undefined) problems.push(MESSAGES.SOURCES_REQUIRED);
  else if (!Array.isArray(fields.sources)) problems.push(MESSAGES.SOURCES_NOT_ARRAY);
  else if (fields.sources.length === 0) {
    if (fields.sources_hash !== undefined) problems.push(MESSAGES.HASH_FORBIDDEN);
  } else {
    if (!fields.sources_hash) problems.push(MESSAGES.HASH_REQUIRED);
    problems.push(...validateSources(fields, MESSAGES.HASH_MISMATCH));
  }

  if (fields.unimplemented !== undefined) {
    if (fields.unimplemented !== 'true') problems.push(MESSAGES.UNIMPLEMENTED_VALUE);
    else if (forbidUnimplemented) problems.push(MESSAGES.UNIMPLEMENTED_FORBIDDEN);
  }

  return problems.map((message) => `${label}: ${message}`);
}

function runCheck(args) {
  const forbidUnimplemented = args.includes('--forbid-unimplemented');
  const layout = loadLayout();
  const { legacyCards, newDocs, errors } = loadDocs(layout);
  const knownIds = new Set(legacyCards.map((card) => expectedId(card.file)));
  const problems = [...errors];
  for (const card of legacyCards) problems.push(...validateCard(card, knownIds));
  for (const doc of newDocs) problems.push(...validateNewDoc(doc, forbidUnimplemented));

  if (problems.length > 0) {
    console.error(`docs に ${problems.length} 件の問題があります。`);
    for (const problem of problems) console.error(`❌ ${problem}`);
    return 1;
  }
  const legacyCount = layout.legacy.length;
  console.log(`✅ docs ${legacyCount + newDocs.length} 本 (うち旧配置 ${legacyCount} 本)、問題なし`);
  return 0;
}

/** 引数 (パスか旧カードの id) を更新対象の文書に解決する */
function resolveDocArg(arg, targets) {
  const byId = targets.find((t) => t.id !== undefined && t.id === arg.replace(/\.md$/, ''));
  if (byId) return byId;
  const absolute = [resolve(process.cwd(), arg), resolve(REPO_ROOT, arg)];
  return targets.find((t) => absolute.includes(t.file));
}

function runUpdate(args) {
  const layout = loadLayout();
  const { legacyCards, newDocs, errors } = loadDocs(layout);
  if (errors.length > 0) {
    for (const error of errors) console.error(`❌ ${error}`);
    return 1;
  }

  // 新しい配置で frontmatter のない文書は検査で別途落ちるため、ここでは対象外にする
  const all = [
    ...legacyCards.map((card) => ({ ...card, id: expectedId(card.file) })),
    ...newDocs.filter((doc) => doc.parsed !== null).map((doc) => ({ ...doc, ...doc.parsed })),
  ];

  const targets = [];
  let failed = false;
  if (args.length === 0) targets.push(...all);
  for (const arg of args) {
    const doc = resolveDocArg(arg, all);
    if (doc) targets.push(doc);
    else {
      console.error(`❌ ${MESSAGES.DOC_NOT_FOUND(arg)}`);
      failed = true;
    }
  }

  for (const doc of targets) {
    const sources = asArray(doc.fields.sources);
    // 出典のない文書にはハッシュが無いので、書き戻すものがない
    if (sources.length === 0) continue;
    const missing = sources.filter((path) => !existsSync(join(REPO_ROOT, path)));
    if (missing.length > 0) {
      console.error(`❌ ${doc.label}: sources のファイルがありません: ${missing.join(', ')}`);
      failed = true;
      continue;
    }

    const hash = computeSourcesHash(sources);
    const lines = [...doc.lines];
    const newLine = `sources_hash: ${hash}`;
    if (doc.keyRanges.sources_hash) {
      const [start] = doc.keyRanges.sources_hash;
      if (lines[start] === newLine) {
        console.log(`変更なし: ${doc.label}`);
        continue;
      }
      lines[start] = newLine;
    } else {
      // sources の直後に置くと、見本の項目順と一致する
      const insertAt = doc.keyRanges.sources ? doc.keyRanges.sources[1] : doc.end;
      lines.splice(insertAt, 0, newLine);
    }
    writeFileSync(doc.file, lines.join('\n'));
    console.log(`更新: ${doc.label}`);
  }
  return failed ? 1 : 0;
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'check') return runCheck(args);
  if (command === 'update') return runUpdate(args);
  console.error(MESSAGES.USAGE);
  return 1;
}

process.exit(main());
