'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ERROR_MESSAGES,
  splitList,
  normalizeDir,
  isTargetLocation,
  buildWorkspaceEntry,
  buildPrebuildList,
  deriveOutputs,
} = require('./list.js');

const ALL_SCRIPTS = {
  lint: 'eslint .',
  'format:check': 'prettier --check .',
  test: 'jest',
  'test:coverage': 'jest --coverage',
  'test:contract': 'jest --config jest.contract.config.ts',
};

test('splitList は空白・改行区切りを配列にし、空要素を除く', () => {
  assert.deepEqual(splitList('a  b\nc\n'), ['a', 'b', 'c']);
  assert.deepEqual(splitList(''), []);
  assert.deepEqual(splitList(undefined), []);
});

test('normalizeDir は ./ と末尾のスラッシュを取り除く', () => {
  assert.equal(normalizeDir('./services/admin/'), 'services/admin');
  assert.equal(normalizeDir('services\\admin'), 'services/admin');
});

test('isTargetLocation は一致と配下だけを対象にし、前方一致だけの別ディレクトリは対象にしない', () => {
  const dirs = ['services/admin'];
  assert.equal(isTargetLocation('services/admin', dirs), true);
  assert.equal(isTargetLocation('services/admin/core', dirs), true);
  assert.equal(isTargetLocation('services/admin-tools/core', dirs), false);
  assert.equal(isTargetLocation('infra/admin', dirs), false);
});

test('buildWorkspaceEntry はスクリプトの有無だけで各検査の要否を決める', () => {
  assert.deepEqual(
    buildWorkspaceEntry(
      { name: '@nagiyu/a', location: 'services/a/core', scripts: ALL_SCRIPTS },
      []
    ),
    {
      name: '@nagiyu/a',
      location: 'services/a/core',
      lint: true,
      format: true,
      test: true,
      coverage: true,
      contract: true,
    }
  );
  assert.deepEqual(buildWorkspaceEntry({ name: '@nagiyu/b', location: 'infra/b' }, []), {
    name: '@nagiyu/b',
    location: 'infra/b',
    lint: false,
    format: false,
    test: false,
    coverage: false,
    contract: false,
  });
});

test('buildWorkspaceEntry は coverage-exclude に含まれるワークスペースの coverage だけ false にする', () => {
  const entry = buildWorkspaceEntry(
    { name: '@nagiyu/a', location: 'services/a/core', scripts: ALL_SCRIPTS },
    ['@nagiyu/a']
  );
  assert.equal(entry.coverage, false);
  assert.equal(entry.test, true);
});

test('buildPrebuildList は core を返し、infra が対象で infra-common が対象外なら infra-common を足す', () => {
  assert.equal(
    buildPrebuildList([
      { name: '@nagiyu/a-core', location: 'services/a/core' },
      { name: '@nagiyu/a-web', location: 'services/a/web' },
      { name: '@nagiyu/infra-a', location: 'infra/a' },
    ]),
    '@nagiyu/a-core @nagiyu/infra-common'
  );
});

test('buildPrebuildList は infra が無ければ infra-common を足さない', () => {
  assert.equal(
    buildPrebuildList([
      { name: '@nagiyu/a-core', location: 'services/a/core' },
      { name: '@nagiyu/a-web', location: 'services/a/web' },
    ]),
    '@nagiyu/a-core'
  );
});

test('buildPrebuildList は infra-common 自体が対象なら重ねて足さない', () => {
  assert.equal(buildPrebuildList([{ name: '@nagiyu/infra-common', location: 'infra/common' }]), '');
});

test('buildPrebuildList は core も infra も無ければ空文字', () => {
  assert.equal(buildPrebuildList([{ name: '@nagiyu/a-web', location: 'services/a/web' }]), '');
});

const CANDIDATES = [
  { name: '@nagiyu/a-web', location: 'services/a/web', scripts: { lint: 'x', test: 'jest' } },
  { name: '@nagiyu/a-core', location: 'services/a/core', scripts: ALL_SCRIPTS },
  { name: '@nagiyu/infra-a', location: 'infra/a', scripts: { build: 'tsc' } },
  { name: '@nagiyu/other-core', location: 'services/other/core', scripts: ALL_SCRIPTS },
];

test('deriveOutputs は dirs 配下だけを location 順に出し、契約テストの有無も出す', () => {
  const outputs = deriveOutputs({ candidates: CANDIDATES, dirs: 'services/a\ninfra/a' });
  const workspaces = JSON.parse(outputs.workspaces);

  assert.deepEqual(
    workspaces.map((workspace) => workspace.name),
    ['@nagiyu/infra-a', '@nagiyu/a-core', '@nagiyu/a-web']
  );
  assert.deepEqual(
    JSON.parse(outputs.contractWorkspaces).map((workspace) => workspace.name),
    ['@nagiyu/a-core']
  );
  assert.equal(outputs.hasContract, 'true');
  assert.equal(outputs.prebuild, '@nagiyu/a-core @nagiyu/infra-common');
});

test('deriveOutputs は契約テストが無ければ has-contract を false にする', () => {
  const outputs = deriveOutputs({ candidates: CANDIDATES, dirs: 'infra/a' });
  assert.equal(outputs.hasContract, 'false');
  assert.equal(outputs.contractWorkspaces, '[]');
});

test('deriveOutputs は coverage-exclude を反映する', () => {
  const outputs = deriveOutputs({
    candidates: CANDIDATES,
    dirs: 'services/a',
    coverageExclude: '@nagiyu/a-core',
  });
  const core = JSON.parse(outputs.workspaces).find(
    (workspace) => workspace.name === '@nagiyu/a-core'
  );
  assert.equal(core.coverage, false);
});

test('deriveOutputs は dirs が空ならエラーにする', () => {
  assert.throws(() => deriveOutputs({ candidates: CANDIDATES, dirs: ' \n' }), {
    message: ERROR_MESSAGES.DIRS_REQUIRED,
  });
});

test('deriveOutputs は対象が 0 件ならエラーにする', () => {
  assert.throws(() => deriveOutputs({ candidates: CANDIDATES, dirs: 'services/none' }), {
    message: ERROR_MESSAGES.NO_WORKSPACES,
  });
});
