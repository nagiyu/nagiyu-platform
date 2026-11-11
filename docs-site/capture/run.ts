/**
 * 仕様カードのスクリーンショットを撮る。
 *
 *   npm run capture:specs -w @nagiyu/docs-site -- <service> [--screen <画面名>]...
 *
 * `CAPTURE_BASE_URL` を指定すると、サービスを起動せずその URL を撮る (撮影シナリオの試行用)。
 * `CAPTURE_OUT_DIR` を指定すると、画像の出力先を変える (再現性の確認用)。
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { chromium } from '@playwright/test';
import { assertUniqueImages, resolveDevices } from '../src/spec-screenshot';
import { createScenarioContext } from './context';
import { admin } from './admin';
import { auth } from './auth';
import { codecConverter } from './codec-converter';
import { portal } from './portal';
import { stockTracker } from './stock-tracker';
import type { CompanionProcess, ServiceCapture } from './types';

const REPO_ROOT = resolve(__dirname, '../..');

const SERVICES: Record<string, ServiceCapture> = {
  admin,
  auth,
  'codec-converter': codecConverter,
  portal,
  'stock-tracker': stockTracker,
};

const MESSAGES = {
  USAGE: `使い方: npm run capture:specs -w @nagiyu/docs-site -- <${Object.keys(SERVICES).join('|')}> [--screen <画面名>]...`,
  UNKNOWN_SERVICE: (name: string) => `撮影の設定がないサービスです: ${name}`,
  UNKNOWN_SCREEN: (name: string) => `撮影シナリオにない画面です: ${name}`,
  MISSING_COMPANION_FILE: (path: string) => `補助のプロセスに必要なファイルがありません: ${path}`,
  MISSING_BUILD: (path: string) =>
    `ビルド成果物がありません: ${path}\n共通ライブラリとサービスの core を先にビルドしてください (build-shared-libs スキル)`,
  BUILD_FAILED: 'サービスのビルドに失敗しました',
  SERVER_TIMEOUT: (url: string) => `サービスの起動を待ちきれませんでした: ${url}`,
} as const;

const SERVER_START_TIMEOUT_MS = 180_000;

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // 起動中は接続できないので待つ
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(MESSAGES.SERVER_TIMEOUT(url));
}

function serverEnv(config: ServiceCapture): NodeJS.ProcessEnv {
  // E2E と同じく、環境変数ファイルの値をサービスのプロセスへ渡す
  return {
    ...process.env,
    ...(config.server.envFile
      ? parse(readFileSync(resolve(REPO_ROOT, config.server.envFile)))
      : {}),
    ...config.server.extraEnv,
  };
}

function buildServer(config: ServiceCapture): void {
  const { server } = config;
  const [command, ...args] = server.build;
  const result = spawnSync(command, args, {
    cwd: resolve(REPO_ROOT, server.cwd),
    env: serverEnv(config),
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(MESSAGES.BUILD_FAILED);
  }
}

function startServer(config: ServiceCapture): ChildProcess {
  const { server } = config;
  const env = serverEnv(config);
  const [command, ...args] = server.command;
  return spawn(command, [...args, '-p', String(server.port)], {
    cwd: resolve(REPO_ROOT, server.cwd),
    env,
    stdio: 'ignore',
    // 子プロセス (next dev) までまとめて止めるため、専用のプロセスグループにする
    detached: true,
  });
}

/** サービスの前に起動する補助のプロセスを立ち上げる。プロセスグループごと止められるようにしておく */
function startCompanion(companion: CompanionProcess): ChildProcess {
  for (const file of companion.requiredFiles ?? []) {
    if (!existsSync(resolve(REPO_ROOT, file))) {
      throw new Error(MESSAGES.MISSING_COMPANION_FILE(file));
    }
  }
  const [command, ...args] = companion.command;
  return spawn(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...companion.env },
    stdio: 'ignore',
    detached: true,
  });
}

function parseArgs(argv: string[]): { service: string; screens: string[] } {
  const [service, ...rest] = argv;
  const screens: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--screen' && rest[i + 1]) {
      screens.push(rest[++i]);
    }
  }
  if (!service) {
    throw new Error(MESSAGES.USAGE);
  }
  return { service, screens };
}

async function main(): Promise<void> {
  const { service, screens } = parseArgs(process.argv.slice(2));
  const config = SERVICES[service];
  if (!config) {
    throw new Error(MESSAGES.UNKNOWN_SERVICE(service));
  }
  for (const screen of screens) {
    if (!config.scenarios.some((s) => s.screen === screen)) {
      throw new Error(MESSAGES.UNKNOWN_SCREEN(screen));
    }
  }

  const devices = resolveDevices(config.service, config.devices);
  const scenarios = config.scenarios.filter(
    (s) => screens.length === 0 || screens.includes(s.screen)
  );
  const outDir = resolve(
    REPO_ROOT,
    process.env.CAPTURE_OUT_DIR ?? `docs/images/specs/${service}/screen`
  );

  let baseUrl = process.env.CAPTURE_BASE_URL;
  let server: ChildProcess | undefined;
  const companions: ChildProcess[] = [];
  if (!baseUrl) {
    for (const build of config.server.requiredBuilds) {
      if (!existsSync(resolve(REPO_ROOT, build))) {
        throw new Error(MESSAGES.MISSING_BUILD(build));
      }
    }
    buildServer(config);
    baseUrl = `http://localhost:${config.server.port}`;
    for (const companion of config.server.companions ?? []) {
      companions.push(startCompanion(companion));
    }
    server = startServer(config);
  }
  const stopServer = () => {
    for (const child of [server, ...companions]) {
      if (child?.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          // すでに止まっている
        }
      }
    }
  };
  process.on('exit', stopServer);

  const written: string[] = [];
  try {
    for (const companion of config.server.companions ?? []) {
      if (!process.env.CAPTURE_BASE_URL) await waitForServer(companion.healthUrl);
    }
    await waitForServer(new URL(config.server.healthPath, baseUrl).toString());
    const browser = await chromium.launch({
      ...(process.env.CAPTURE_CHROMIUM_PATH
        ? { executablePath: process.env.CAPTURE_CHROMIUM_PATH }
        : {}),
      // GPU とフォントのヒンティングによる描画の揺れを避け、同じ環境なら同じ画像にする
      args: ['--disable-gpu', '--font-render-hinting=none', '--disable-lcd-text'],
    });
    try {
      for (const scenario of scenarios) {
        for (const device of devices) {
          const context = await createScenarioContext({
            browser,
            config,
            screen: scenario.screen,
            device,
            baseUrl,
            outDir,
            onWrite: (fileName) => {
              // 同じ名前の画像が重なると後の撮影が前の画像を上書きするので、その場で止める
              assertUniqueImages([...written, fileName]);
              written.push(fileName);
            },
          });
          try {
            await scenario.run(context.ctx);
          } finally {
            await context.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    stopServer();
  }

  console.log(`${written.length} 枚を ${outDir} に書きました`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
