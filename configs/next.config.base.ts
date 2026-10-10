import fs from 'fs';
import path from 'path';
import type { NextConfig } from 'next';

/** モノレポのルート。サービスの深さ (services/tools は他より 1 段浅い) に依存させないため、このファイルの位置から決める */
const MONOREPO_ROOT = path.resolve(__dirname, '..');

/** 自前のワークスペースパッケージを判別する接頭辞 */
const WORKSPACE_SCOPE = '@nagiyu/';

const ERROR_MESSAGES = {
  PACKAGE_JSON_READ_FAILED: 'package.json の読み込みに失敗しました',
} as const;

/**
 * サービスの package.json が依存する `@nagiyu/*` を列挙する。
 * 手書きの一覧は依存の増減に追従せず食い違うため、package.json から導く。
 */
function resolveWorkspaceDependencies(serviceDir: string): string[] {
  const packageJsonPath = path.join(serviceDir, 'package.json');
  let packageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${ERROR_MESSAGES.PACKAGE_JSON_READ_FAILED}: ${packageJsonPath} (${reason})`);
  }

  const names = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ]);
  return [...names].filter((name) => name.startsWith(WORKSPACE_SCOPE));
}

/**
 * web アプリ共通の Next.js 設定を作る。
 *
 * サービス側は固有の設定 (redirects / headers 等) だけを `overrides` に渡す。
 * `overrides` は共通設定より優先される。
 *
 * @param serviceDir package.json があるサービスのディレクトリ (呼び出し側の `__dirname`)
 * @param overrides サービス固有の設定
 */
export function createNextConfig(serviceDir: string, overrides: NextConfig = {}): NextConfig {
  return {
    output: 'standalone',
    // standalone にモノレポ内の共通 libs と node_modules を含めるため、トレースの起点をルートに固定する
    outputFileTracingRoot: MONOREPO_ROOT,
    transpilePackages: resolveWorkspaceDependencies(serviceDir),
    ...overrides,
  };
}
