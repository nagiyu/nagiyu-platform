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
  deriveInfraOutputs,
  isInfraLocation,
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
  { name: '@nagiyu/infra-a', location: 'infra/a', scripts: { build: 'tsc', test: 'jest' } },
  { name: '@nagiyu/other-core', location: 'services/other/core', scripts: ALL_SCRIPTS },
];

test('deriveOutputs は dirs 配下だけを location 順に出し、契約テストの有無も出す', () => {
  const outputs = deriveOutputs({ candidates: CANDIDATES, dirs: 'services/a\ninfra/a' });
  const workspaces = JSON.parse(outputs.workspaces);

  assert.deepEqual(
    workspaces.map((workspace) => workspace.name),
    ['@nagiyu/infra-a', '@nagiyu/a-core', '@nagiyu/a-web']
  );
  assert.deepEqual(JSON.parse(outputs.contractWorkspaces), ['@nagiyu/a-core']);
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

test('deriveOutputs は検査のスクリプトを 1 つも持たないワークスペースを除く', () => {
  const outputs = deriveOutputs({
    candidates: [
      { name: '@nagiyu/b-core', location: 'services/b/core', scripts: ALL_SCRIPTS },
      { name: '@nagiyu/infra-b', location: 'infra/b', scripts: { build: 'tsc' } },
    ],
    dirs: 'services/b infra/b',
  });
  const names = JSON.parse(outputs.workspaces).map((workspace) => workspace.name);
  assert.deepEqual(names, ['@nagiyu/b-core']);
  // 除いた infra のために infra-common を事前ビルドしない
  assert.equal(outputs.prebuild, '@nagiyu/b-core');
});

test('deriveOutputs は検査できるワークスペースが 0 件ならエラーにする', () => {
  assert.throws(
    () =>
      deriveOutputs({
        candidates: [{ name: '@nagiyu/infra-c', location: 'infra/c', scripts: { build: 'tsc' } }],
        dirs: 'infra/c',
      }),
    { message: ERROR_MESSAGES.NO_WORKSPACES }
  );
});

const NESTED_CANDIDATES = [
  { name: '@nagiyu/infra', location: 'infra', scripts: { build: 'tsc', synth: 'cdk synth' } },
  { name: '@nagiyu/infra-common', location: 'infra/common', scripts: ALL_SCRIPTS },
  { name: '@nagiyu/tools', location: 'services/tools', scripts: ALL_SCRIPTS },
  { name: '@nagiyu/tools-extra', location: 'services/tools/extra', scripts: ALL_SCRIPTS },
  { name: '@nagiyu/auth-core', location: 'services/auth/core', scripts: ALL_SCRIPTS },
  { name: '@nagiyu/auth-web', location: 'services/auth/web', scripts: ALL_SCRIPTS },
];

test('isTargetLocation はワークスペースそのものを指したディレクトリの配下を拾わない', () => {
  const locations = new Set(NESTED_CANDIDATES.map((candidate) => candidate.location));
  assert.equal(isTargetLocation('infra', ['infra'], locations), true);
  assert.equal(isTargetLocation('infra/common', ['infra'], locations), false);
  assert.equal(isTargetLocation('services/tools/extra', ['services/tools'], locations), false);
});

test('isTargetLocation はワークスペースではないディレクトリの配下を拾う', () => {
  const locations = new Set(NESTED_CANDIDATES.map((candidate) => candidate.location));
  assert.equal(isTargetLocation('services/auth/core', ['services/auth'], locations), true);
  assert.equal(isTargetLocation('services/auth/web', ['services/auth'], locations), true);
  assert.equal(isTargetLocation('infra/common', ['infra/common'], locations), true);
});

test('deriveOutputs はワークスペースを指した dirs でそのワークスペースだけを出す', () => {
  const names = (dirs) =>
    JSON.parse(deriveOutputs({ candidates: NESTED_CANDIDATES, dirs }).workspaces).map(
      (workspace) => workspace.name
    );
  assert.deepEqual(names('services/tools'), ['@nagiyu/tools']);
  assert.deepEqual(names('infra/common'), ['@nagiyu/infra-common']);
  assert.deepEqual(names('services/auth'), ['@nagiyu/auth-core', '@nagiyu/auth-web']);
});

const INFRA_CANDIDATES = [
  { name: '@nagiyu/infra', location: 'infra', scripts: { build: 'tsc', synth: 'cdk synth' } },
  { name: '@nagiyu/infra-common', location: 'infra/common', scripts: ALL_SCRIPTS },
  {
    name: '@nagiyu/infra-a',
    location: 'infra/a',
    scripts: { build: 'tsc', synth: 'cdk synth', lint: 'eslint' },
  },
  { name: '@nagiyu/infra-b', location: 'infra/b', scripts: { build: 'tsc', test: 'jest' } },
  { name: '@nagiyu/infra-nobuild', location: 'infra/nobuild', scripts: { lint: 'eslint' } },
  { name: '@nagiyu/a-core', location: 'services/a/core', scripts: ALL_SCRIPTS },
  { name: '@nagiyu/a-build', location: 'services/a/build', scripts: { build: 'tsc' } },
];

test('isInfraLocation は infra 自体と infra/ 配下だけを infra とする', () => {
  assert.equal(isInfraLocation('infra'), true);
  assert.equal(isInfraLocation('infra/a'), true);
  assert.equal(isInfraLocation('infra-other/a'), false);
  assert.equal(isInfraLocation('services/a/core'), false);
});

test('deriveInfraOutputs は build を持つ infra のワークスペースと synth の有無を出す', () => {
  const outputs = deriveInfraOutputs({ candidates: INFRA_CANDIDATES, dirs: 'infra/a infra/b' });
  assert.deepEqual(JSON.parse(outputs.workspaces), [
    { name: '@nagiyu/infra-a', location: 'infra/a', synth: true },
    { name: '@nagiyu/infra-b', location: 'infra/b', synth: false },
  ]);
});

test('deriveInfraOutputs は lint や test を持たないルートの infra も対象にし、配下は拾わない', () => {
  const outputs = deriveInfraOutputs({ candidates: INFRA_CANDIDATES, dirs: 'infra' });
  assert.deepEqual(JSON.parse(outputs.workspaces), [
    { name: '@nagiyu/infra', location: 'infra', synth: true },
  ]);
});

test('deriveInfraOutputs は infra 以外のワークスペースを build があっても除く', () => {
  const outputs = deriveInfraOutputs({
    candidates: INFRA_CANDIDATES,
    dirs: 'services/a infra/a',
  });
  assert.deepEqual(
    JSON.parse(outputs.workspaces).map((workspace) => workspace.name),
    ['@nagiyu/infra-a']
  );
});

test('deriveInfraOutputs は dirs が空ならエラーにする', () => {
  assert.throws(() => deriveInfraOutputs({ candidates: INFRA_CANDIDATES, dirs: '' }), {
    message: ERROR_MESSAGES.DIRS_REQUIRED,
  });
});

test('deriveInfraOutputs は build を持つ infra が 0 件ならエラーにする', () => {
  assert.throws(() => deriveInfraOutputs({ candidates: INFRA_CANDIDATES, dirs: 'infra/nobuild' }), {
    message: ERROR_MESSAGES.NO_INFRA_WORKSPACES,
  });
  assert.throws(() => deriveInfraOutputs({ candidates: INFRA_CANDIDATES, dirs: 'services/a' }), {
    message: ERROR_MESSAGES.NO_INFRA_WORKSPACES,
  });
});
