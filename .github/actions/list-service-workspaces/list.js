'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ERROR_MESSAGES = {
  DIRS_REQUIRED: 'dirs が指定されていません',
  NO_WORKSPACES: '検査をかけるワークスペースが見つかりません。dirs を確認してください',
  WORKSPACES_NOT_FOUND: 'ルートの package.json に workspaces が定義されていません',
  NO_INFRA_WORKSPACES:
    'build を持つ infra のワークスペースが見つかりません。dirs を確認してください',
  INVALID_MODE: 'mode が不正です。service または infra を指定してください',
};

const MODES = {
  service: 'service',
  infra: 'infra',
};

// infra の検査は lint や test の有無に関わらず、ビルドできることと synth できることだけを見る
const INFRA_SCRIPT_NAMES = {
  build: 'build',
  synth: 'synth',
};
const INFRA_ROOT_LOCATION = 'infra';

// 検査の要否は、テストの中身ではなく npm scripts の有無だけで決める。呼び出し側のワークフローが検査を個別に並べなくて済む
const SCRIPT_NAMES = {
  lint: 'lint',
  format: 'format:check',
  test: 'test',
  coverage: 'test:coverage',
  contract: 'test:contract',
};

const CORE_SUFFIX = '/core';
const INFRA_PREFIX = 'infra/';
const INFRA_COMMON_LOCATION = 'infra/common';
const INFRA_COMMON_NAME = '@nagiyu/infra-common';

/**
 * 空白・改行区切りの文字列を、空要素を除いた配列にする。
 * @param {string | undefined} value
 * @returns {string[]}
 */
function splitList(value) {
  return (value || '').split(/\s+/).filter((item) => item !== '');
}

/**
 * ディレクトリ指定を比較しやすい形に揃える。
 * 末尾のスラッシュや `./` の有無で一致判定がぶれないようにする。
 * @param {string} dir
 * @returns {string}
 */
function normalizeDir(dir) {
  return dir.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * ワークスペースの location が、指定ディレクトリのいずれかと一致するか配下にあるかを返す。
 * 前方一致だけにすると `services/admin` が `services/admin-tools` を拾うため、区切りまで含めて比較する。
 * ワークスペースそのものを指したディレクトリは、そのワークスペースだけを対象にする。
 * `infra` がワークスペースでもあるため、これを許すと `infra/*` まで巻き込んでしまう。
 * @param {string} location
 * @param {string[]} dirs 正規化済みのディレクトリ
 * @param {Set<string>} [workspaceLocations] 全ワークスペースの location。省略時は配下を常に拾う
 * @returns {boolean}
 */
function isTargetLocation(location, dirs, workspaceLocations) {
  return dirs.some((dir) => {
    if (location === dir) {
      return true;
    }
    if (workspaceLocations && workspaceLocations.has(dir)) {
      return false;
    }
    return location.startsWith(`${dir}/`);
  });
}

/**
 * package.json の内容から、検査の要否を表すワークスペースの行を作る純粋関数。
 * @param {{ name: string, location: string, scripts?: Record<string, string> }} params
 * @param {string[]} coverageExclude カバレッジ検査から外すワークスペース名
 * @returns {{ name: string, location: string, lint: boolean, format: boolean, test: boolean, coverage: boolean, contract: boolean }}
 */
function buildWorkspaceEntry({ name, location, scripts }, coverageExclude) {
  const has = (script) => Boolean(scripts && scripts[script]);
  return {
    name,
    location,
    lint: has(SCRIPT_NAMES.lint),
    format: has(SCRIPT_NAMES.format),
    test: has(SCRIPT_NAMES.test),
    coverage: has(SCRIPT_NAMES.coverage) && !coverageExclude.includes(name),
    contract: has(SCRIPT_NAMES.contract),
  };
}

/**
 * テストの前にビルドが要るワークスペース名を空白区切りで返す。
 * web や batch は core のビルド成果物を参照し、infra の各パッケージは infra-common のビルド成果物を参照する。
 * @param {Array<{ name: string, location: string }>} workspaces 対象のワークスペース
 * @returns {string}
 */
function buildPrebuildList(workspaces) {
  const names = workspaces
    .filter((workspace) => workspace.location.endsWith(CORE_SUFFIX))
    .map((workspace) => workspace.name);

  const hasInfra = workspaces.some((workspace) => workspace.location.startsWith(INFRA_PREFIX));
  const hasInfraCommon = workspaces.some(
    (workspace) => workspace.location === INFRA_COMMON_LOCATION
  );
  if (hasInfra && !hasInfraCommon) {
    names.push(INFRA_COMMON_NAME);
  }
  return names.join(' ');
}

/**
 * dirs の入力を正規化した配列にする。空ならエラーにする。
 * @param {string | undefined} dirs
 * @returns {string[]}
 */
function parseDirs(dirs) {
  const targetDirs = splitList(dirs).map(normalizeDir);
  if (targetDirs.length === 0) {
    throw new Error(ERROR_MESSAGES.DIRS_REQUIRED);
  }
  return targetDirs;
}

/**
 * ワークスペースが infra 配下 (`infra` 自体または `infra/` 配下) かを返す。
 * @param {string} location
 * @returns {boolean}
 */
function isInfraLocation(location) {
  return location === INFRA_ROOT_LOCATION || location.startsWith(INFRA_PREFIX);
}

/**
 * infra の検査対象 (build を持つ infra 配下のワークスペース) と、synth の有無を導く純粋関数。
 * lint や test を持たないワークスペースも対象にするため、service モードの hasAnyCheck は通さない。
 * @param {{
 *   candidates: Array<{ name: string, location: string, scripts?: Record<string, string> }>,
 *   dirs: string,
 * }} params
 * @returns {{ workspaces: string }} workspaces は [{name, location, synth}] の JSON
 */
function deriveInfraOutputs({ candidates, dirs }) {
  const targetDirs = parseDirs(dirs);
  const workspaceLocations = new Set(candidates.map((candidate) => candidate.location));

  const entries = candidates
    .filter(
      (candidate) =>
        isInfraLocation(candidate.location) &&
        isTargetLocation(candidate.location, targetDirs, workspaceLocations) &&
        Boolean(candidate.scripts && candidate.scripts[INFRA_SCRIPT_NAMES.build])
    )
    .map(({ name, location, scripts }) => ({
      name,
      location,
      synth: Boolean(scripts[INFRA_SCRIPT_NAMES.synth]),
    }))
    .sort((a, b) => a.location.localeCompare(b.location));

  if (entries.length === 0) {
    throw new Error(ERROR_MESSAGES.NO_INFRA_WORKSPACES);
  }

  return { workspaces: JSON.stringify(entries) };
}

/**
 * ワークスペース候補から、GITHUB_OUTPUT に出す値を導く純粋関数。
 * @param {{
 *   candidates: Array<{ name: string, location: string, scripts?: Record<string, string> }>,
 *   dirs: string,
 *   coverageExclude?: string,
 * }} params
 * @returns {{ workspaces: string, contractWorkspaces: string, hasContract: string, prebuild: string }}
 */
function deriveOutputs({ candidates, dirs, coverageExclude }) {
  const targetDirs = parseDirs(dirs);
  const workspaceLocations = new Set(candidates.map((candidate) => candidate.location));

  const excluded = splitList(coverageExclude);
  const entries = candidates
    .filter((candidate) => isTargetLocation(candidate.location, targetDirs, workspaceLocations))
    .map((candidate) => buildWorkspaceEntry(candidate, excluded))
    // 検査のスクリプトを 1 つも持たないワークスペースは、何もしないジョブが立つだけなので除く
    .filter(hasAnyCheck)
    .sort((a, b) => a.location.localeCompare(b.location));

  if (entries.length === 0) {
    throw new Error(ERROR_MESSAGES.NO_WORKSPACES);
  }

  const contractEntries = entries.filter((entry) => entry.contract);
  return {
    workspaces: JSON.stringify(entries),
    contractWorkspaces: JSON.stringify(contractEntries.map((entry) => entry.name)),
    hasContract: String(contractEntries.length > 0),
    prebuild: buildPrebuildList(entries),
  };
}

/**
 * 検査を 1 つでもかけるワークスペースかを返す。
 * @param {{ lint: boolean, format: boolean, test: boolean, coverage: boolean, contract: boolean }} entry
 * @returns {boolean}
 */
function hasAnyCheck(entry) {
  return Object.keys(SCRIPT_NAMES).some((key) => entry[key]);
}

/**
 * ルートの package.json の workspaces を展開し、各ワークスペースの package.json を読む。
 * npm ci 前でも動かすため、npm ではなくファイルシステムから直接導く。
 * @param {string} root リポジトリのルート
 * @returns {Array<{ name: string, location: string, scripts?: Record<string, string> }>}
 */
function readCandidates(root) {
  const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const patterns = Array.isArray(rootPackage.workspaces)
    ? rootPackage.workspaces
    : rootPackage.workspaces && rootPackage.workspaces.packages;
  if (!patterns || patterns.length === 0) {
    throw new Error(ERROR_MESSAGES.WORKSPACES_NOT_FOUND);
  }

  const locations = new Set();
  for (const pattern of patterns) {
    for (const match of fs.globSync(pattern, { cwd: root })) {
      const location = normalizeDir(match);
      if (fs.existsSync(path.join(root, location, 'package.json'))) {
        locations.add(location);
      }
    }
  }

  return [...locations].map((location) => {
    const { name, scripts } = JSON.parse(
      fs.readFileSync(path.join(root, location, 'package.json'), 'utf8')
    );
    return { name, location, scripts };
  });
}

/**
 * 出力を GITHUB_OUTPUT に書く。ローカル実行では標準出力に出す。
 * @param {Record<string, string>} outputs
 * @returns {void}
 */
function writeOutputs(outputs) {
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
    return;
  }
  console.log(lines.join('\n'));
}

/**
 * action から呼ぶ入口。
 * 入力は env から受け取り、シェルのコマンド文字列に埋め込まない。
 * @returns {void}
 */
function run() {
  const root = process.env.GITHUB_WORKSPACE || process.cwd();
  const mode = process.env.LIST_MODE || MODES.service;

  if (mode === MODES.infra) {
    const infraOutputs = deriveInfraOutputs({
      candidates: readCandidates(root),
      dirs: process.env.LIST_DIRS,
    });
    writeOutputs({ workspaces: infraOutputs.workspaces });
    return;
  }
  if (mode !== MODES.service) {
    throw new Error(ERROR_MESSAGES.INVALID_MODE);
  }

  const outputs = deriveOutputs({
    candidates: readCandidates(root),
    dirs: process.env.LIST_DIRS,
    coverageExclude: process.env.LIST_COVERAGE_EXCLUDE,
  });

  writeOutputs({
    workspaces: outputs.workspaces,
    'contract-workspaces': outputs.contractWorkspaces,
    'has-contract': outputs.hasContract,
    prebuild: outputs.prebuild,
  });
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  ERROR_MESSAGES,
  splitList,
  normalizeDir,
  isTargetLocation,
  buildWorkspaceEntry,
  buildPrebuildList,
  deriveOutputs,
  deriveInfraOutputs,
  isInfraLocation,
  readCandidates,
};
