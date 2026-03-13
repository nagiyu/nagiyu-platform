const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const scriptPath = path.resolve(__dirname, '../../../../.github/scripts/docker-build-lock.sh');

function createFakeAwsScript(baseDir, listCount) {
  const fakeAwsPath = path.join(baseDir, 'aws');
  const commandLogPath = path.join(baseDir, 'aws-commands.log');

  const fakeAws = `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "${commandLogPath}"
if [ "$1" = "s3api" ] && [ "$2" = "list-objects-v2" ]; then
  echo "${listCount}"
  exit 0
fi
if [ "$1" = "s3api" ] && [ "$2" = "put-object" ]; then
  exit 0
fi
if [ "$1" = "s3api" ] && [ "$2" = "delete-object" ]; then
  exit 0
fi
echo "unexpected aws command" >&2
exit 1
`;

  fs.writeFileSync(fakeAwsPath, fakeAws, { mode: 0o755 });
  return commandLogPath;
}

function runLockScript(command, fakeBinDir) {
  execFileSync(scriptPath, [command], {
    env: {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH}`,
      GITHUB_WORKFLOW: 'Test Workflow',
      GITHUB_RUN_ID: '12345',
      GITHUB_JOB: 'build-and-push',
    },
    stdio: 'pipe',
  });
}

describe('docker-build-lock.sh', () => {
  it('ロック上限未満のときにロック取得する', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-lock-test-acquire-'));
    const commandLogPath = createFakeAwsScript(tempDir, 1);

    runLockScript('acquire', tempDir);

    const commandLog = fs.readFileSync(commandLogPath, 'utf8');
    expect(commandLog).toContain('s3api list-objects-v2');
    expect(commandLog).toContain('s3api put-object');
    expect(commandLog).toContain('--bucket nagiyu-docker-build-lock');
    expect(commandLog).toContain('--key locks/Test Workflow/12345/build-and-push');
  });

  it('ロック解放時にdelete-objectを実行する', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-lock-test-release-'));
    const commandLogPath = createFakeAwsScript(tempDir, 0);

    runLockScript('release', tempDir);

    const commandLog = fs.readFileSync(commandLogPath, 'utf8');
    expect(commandLog).toContain('s3api delete-object');
    expect(commandLog).toContain('--bucket nagiyu-docker-build-lock');
    expect(commandLog).toContain('--key locks/Test Workflow/12345/build-and-push');
  });

  it('ロック数が数値でない場合はエラー終了する', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-lock-test-invalid-count-'));
    createFakeAwsScript(tempDir, 'invalid');

    expect(() => runLockScript('acquire', tempDir)).toThrow();
  });
});
