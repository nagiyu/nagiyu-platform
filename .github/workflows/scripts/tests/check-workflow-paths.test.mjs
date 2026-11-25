import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  checkRepository,
  collectTsconfigRequirements,
  globToRegExp,
  parsePaths,
  parseTsconfig,
  scanReferences,
} from '../check-workflow-paths.mjs';

/**
 * 一時ディレクトリに、渡したファイルだけのリポジトリを作る。
 * @param {Record<string, string>} files
 */
function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'workflow-paths-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function workflow(paths, jobs = '  a:\n    runs-on: ubuntu-latest\n') {
  const list = paths.map((p) => `      - '${p}'`).join('\n');
  return `name: t\non:\n  pull_request:\n    branches:\n      - develop\n    paths:\n${list}\njobs:\n${jobs}`;
}

function withRepo(files, fn) {
  const root = makeRepo(files);
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const missingPaths = (r) => r.missing.map((m) => m.path).sort();

test('parsePaths は push と pull_request の paths を読み、コメントとクォートを扱う', () => {
  const content = [
    'on:',
    '  push:',
    '    branches: [develop]',
    '    paths:',
    '      - "a/**" # コメント',
    '      - b.json',
    '  pull_request:',
    '    paths:',
    "    - 'c/*'",
    '  workflow_dispatch:',
    'jobs: {}',
  ].join('\n');
  const { events, errors } = parsePaths('x.yml', content);
  assert.deepEqual(errors, []);
  assert.deepEqual(events, [
    { event: 'push', patterns: ['a/**', 'b.json'] },
    { event: 'pull_request', patterns: ['c/*'] },
  ]);
});

test('parsePaths は paths-ignore とインラインの paths を読めない形として返す', () => {
  const ignore = parsePaths('x.yml', 'on:\n  push:\n    paths-ignore:\n      - a\n');
  assert.equal(ignore.errors.length, 1);
  assert.match(ignore.errors[0], /paths-ignore/);
  const inline = parsePaths('x.yml', "on:\n  push:\n    paths: ['a']\n");
  assert.equal(inline.errors.length, 1);
});

test('paths を持たない workflow は対象外', () => {
  assert.deepEqual(parsePaths('x.yml', 'on:\n  workflow_dispatch:\n  schedule:\n    - cron: "0 0 * * *"\n'), {
    events: [],
    errors: [],
  });
});

test('globToRegExp は ** と * の当たりを区別する', () => {
  assert.ok(globToRegExp('libs/**').test('libs/a/b/c.ts'));
  assert.ok(!globToRegExp('libs/**').test('libs'));
  assert.ok(globToRegExp('**/Dockerfile').test('Dockerfile'));
  assert.ok(globToRegExp('**/Dockerfile').test('a/b/Dockerfile'));
  assert.ok(globToRegExp('**/tsconfig*.json').test('services/a/tsconfig.build.json'));
  assert.ok(globToRegExp('infra/*').test('infra/a'));
  assert.ok(!globToRegExp('infra/*').test('infra/a/b'));
  assert.ok(globToRegExp('.node-version').test('.node-version'));
  assert.ok(!globToRegExp('.node-version').test('xnode-version'));
  assert.throws(() => globToRegExp('a/[ab]'));
  assert.throws(() => globToRegExp('a**b'));
});

test('scanReferences は action・reusable・スクリプト・node-version を拾い、コメントは無視する', () => {
  const refs = scanReferences(
    [
      '# uses: ./.github/actions/ignored',
      'steps:',
      '  - uses: ./.github/actions/setup-node',
      '  - uses: "./.github/workflows/reusable-x.yml"',
      '  - run: ./.github/scripts/build.sh --x',
      '  - run: bash .github/scripts/sub/run.sh',
      '  - run: .github/workflows/scripts/other.sh',
      '  - run: ./x/.github/scripts/ignored.sh',
      '    with:',
      '      node-version-file: ".node-version"',
    ].join('\n'),
  );
  assert.deepEqual(refs.actions, ['setup-node']);
  assert.deepEqual(refs.reusables, ['reusable-x.yml']);
  assert.deepEqual(refs.scripts, [
    '.github/scripts/build.sh',
    '.github/scripts/sub/run.sh',
    '.github/workflows/scripts/other.sh',
  ]);
  assert.equal(refs.nodeVersion, true);
});

test('action の中の action を再帰して辿り、経路を示す', () => {
  withRepo(
    {
      '.github/workflows/w.yml': workflow(['.github/workflows/w.yml'], '  a:\n    steps:\n      - uses: ./.github/actions/push\n'),
      '.github/actions/push/action.yml': 'runs:\n  steps:\n    - uses: ./.github/actions/build\n',
      '.github/actions/build/action.yml': 'runs:\n  steps:\n    - run: ./.github/scripts/b.sh\n',
      '.github/scripts/b.sh': '',
    },
    (root) => {
      const r = checkRepository(root, []);
      assert.deepEqual(missingPaths(r), [
        '.github/actions/build/action.yml',
        '.github/actions/push/action.yml',
        '.github/scripts/b.sh',
      ]);
      const build = r.missing.find((m) => m.path === '.github/actions/build/action.yml');
      assert.deepEqual(build.via, ['push', 'build']);
      assert.deepEqual(r.problems, []);
    },
  );
});

test('reusable workflow 自身とその中身を辿り、node-version-file は .node-version を要る', () => {
  withRepo(
    {
      '.github/workflows/w.yml': workflow(['.github/workflows/w.yml'], '  a:\n    uses: ./.github/workflows/r.yml\n'),
      '.github/workflows/r.yml': 'on:\n  workflow_call:\njobs:\n  b:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version-file: .node-version\n',
    },
    (root) => {
      const r = checkRepository(root, []);
      assert.deepEqual(missingPaths(r), ['.github/workflows/r.yml', '.node-version']);
      assert.deepEqual(r.missing.find((m) => m.path === '.node-version').via, ['r.yml']);
    },
  );
});

test('対象 workflow 自身が paths に無ければ落ちる', () => {
  withRepo({ '.github/workflows/w.yml': workflow(['src/**']) }, (root) => {
    assert.deepEqual(missingPaths(checkRepository(root, [])), ['.github/workflows/w.yml']);
  });
});

test('tsconfig の extends 連鎖から、ディレクトリ外の継承元を要るものとして集める', () => {
  withRepo(
    {
      'infra/a/tsconfig.json': '// コメント\n{ "extends": "../tsconfig.json" }\n',
      'infra/a/node_modules/x/tsconfig.json': '{ "extends": "../../../../nowhere.json" }',
      'infra/tsconfig.json': '{ "extends": "../configs/tsconfig.base" }',
      'configs/tsconfig.base.json': '{ "extends": "@tsconfig/node20/tsconfig.json" }',
    },
    (root) => {
      const { requirements, errors } = collectTsconfigRequirements(root, 'infra/a');
      assert.deepEqual(errors, []);
      assert.deepEqual([...requirements.keys()].sort(), ['configs/tsconfig.base.json', 'infra/tsconfig.json']);

      mkdirSync(join(root, '.github/workflows'), { recursive: true });
      writeFileSync(
        join(root, '.github/workflows/w.yml'),
        workflow(['.github/workflows/w.yml', 'infra/a/**', 'infra/tsconfig.json']),
      );
      assert.deepEqual(missingPaths(checkRepository(root, [])), ['configs/tsconfig.base.json']);
    },
  );
});

test('** と * の当たりが判定に効く', () => {
  const files = {
    '.github/actions/x/action.yml': 'runs: {}\n',
    '.github/workflows/w.yml': workflow(
      ['.github/workflows/w.yml', '.github/actions/*'],
      '  a:\n    steps:\n      - uses: ./.github/actions/x\n',
    ),
  };
  withRepo(files, (root) => {
    assert.deepEqual(missingPaths(checkRepository(root, [])), ['.github/actions/x/action.yml']);
  });
  files['.github/workflows/w.yml'] = files['.github/workflows/w.yml'].replace('actions/*', 'actions/**');
  withRepo(files, (root) => {
    assert.deepEqual(missingPaths(checkRepository(root, [])), []);
  });
});

test('否定パターンと未対応のグロブは落ちる', () => {
  withRepo({ '.github/workflows/w.yml': workflow(['.github/workflows/w.yml', '!docs/**', 'a/[x]']) }, (root) => {
    const r = checkRepository(root, []);
    assert.equal(r.problems.length, 2);
    assert.match(r.problems[0], /否定パターン/);
    assert.match(r.problems[1], /扱えない記法/);
  });
});

test('除外に当たるものは漏れから外れ、不要な除外は落ちる', () => {
  const files = { '.github/workflows/w.yml': workflow(['src/**']) };
  withRepo(files, (root) => {
    const used = [{ workflow: 'w.yml', path: '.github/workflows/w.yml', reason: 'テスト' }];
    const r = checkRepository(root, used);
    assert.deepEqual(r.missing, []);
    assert.deepEqual(r.problems, []);

    const stale = [
      { workflow: 'w.yml', path: 'src/a.ts', reason: '既に当たる' },
      { workflow: 'none.yml', path: 'x', reason: '該当 workflow なし' },
    ];
    const r2 = checkRepository(root, [...used, ...stale]);
    assert.equal(r2.problems.length, 2);
    assert.match(r2.problems[0], /不要/);
  });
});

test('scanReferences はワークスペース変数に続くスクリプトの参照も拾う', () => {
  const refs = scanReferences(
    [
      '  - run: bash $GITHUB_WORKSPACE/.github/scripts/a.sh',
      '  - run: bash ${GITHUB_WORKSPACE}/.github/scripts/b.sh',
      '  - run: bash ${{ github.workspace }}/.github/workflows/scripts/c.sh',
      '  - run: node .github/workflows/scripts/tests/c.test.mjs',
    ].join('\n'),
  );
  assert.deepEqual(refs.scripts, [
    '.github/scripts/a.sh',
    '.github/scripts/b.sh',
    '.github/workflows/scripts/c.sh',
    '.github/workflows/scripts/tests/c.test.mjs',
  ]);
});

test('.github/workflows/scripts のスクリプトが paths に無ければ落ちる', () => {
  withRepo(
    {
      '.github/workflows/w.yml': workflow(
        ['.github/workflows/w.yml'],
        '  a:\n    steps:\n      - run: python3 .github/workflows/scripts/x.py\n',
      ),
    },
    (root) => {
      assert.deepEqual(missingPaths(checkRepository(root, [])), ['.github/workflows/scripts/x.py']);
    },
  );
});

test('pull_request_target の paths も検査する', () => {
  const content = 'on:\n  pull_request_target:\n    paths:\n      - src/**\njobs:\n  a:\n    runs-on: x\n';
  assert.deepEqual(parsePaths('x.yml', content).events, [{ event: 'pull_request_target', patterns: ['src/**'] }]);
  withRepo({ '.github/workflows/w.yml': content }, (root) => {
    const r = checkRepository(root, []);
    assert.deepEqual(missingPaths(r), ['.github/workflows/w.yml']);
    assert.equal(r.missing[0].event, 'pull_request_target');
  });
});

test('parseTsconfig は行末・ブロックのコメントと末尾カンマを読み、文字列の中は壊さない', () => {
  const text = [
    '// 先頭',
    '{',
    '  /* ブロック',
    '     コメント */',
    '  "extends": "./base.json", // 行末',
    '  "compilerOptions": {',
    '    "paths": {"@/*": ["./src/*"]},',
    '    "x": "http://example.com/a",',
    '    "q": "a\\"//b",',
    '  },',
    '  "include": ["a", "b",],',
    '}',
  ].join('\n');
  assert.deepEqual(parseTsconfig(text), {
    extends: './base.json',
    compilerOptions: { paths: { '@/*': ['./src/*'] }, x: 'http://example.com/a', q: 'a"//b' },
    include: ['a', 'b'],
  });
});

test('読めない tsconfig は、ファイル名と JSON のエラーつきで落ちる', () => {
  withRepo({ 'infra/a/tsconfig.json': '{ "extends": ' }, (root) => {
    const { errors } = collectTsconfigRequirements(root, 'infra/a');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /infra\/a\/tsconfig\.json/);
    assert.match(errors[0], /JSON/);
  });
});
