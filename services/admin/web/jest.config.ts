import type { Config } from 'jest';
import nextJest from 'next/jest.js';
import nagiyuLib from '../../../configs/jest/nagiyu-lib.cjs';

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  resolver: nagiyuLib.resolver,
  moduleNameMapper: {
    // @nagiyu/ui の CSS Modules import をスタブ化（クラス名そのものを返す）
    '\\.module\\.css$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Exclude E2E tests from Jest (they use Playwright)
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],
  // Exclude monorepo root and build artifacts from module scanning
  modulePathIgnorePatterns: ['<rootDir>/../../../package.json', '<rootDir>/.next/'],
  // Common coverage settings
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/lib/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/types/**/*'],
  // Coverage thresholds (fail if below 80%)
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

const createConfig = createJestConfig(config);

// next/jest は node_modules を変換対象から外し、カスタム設定の transformIgnorePatterns は追加しかできない
// (どれか 1 つに一致すれば除外される)。そのままでは公開版の @nagiyu/* (ESM) が変換されないため、
// 解決済みの設定のうち node_modules 全体を除外するパターンだけ @nagiyu/* を除いた形に差し替える。
// 変換には next/jest 既定の SWC が使われ、ESM は CJS に変換される。
const resolveConfig = async (): Promise<Config> => {
  const resolved = await createConfig();
  return {
    ...resolved,
    transformIgnorePatterns: (resolved.transformIgnorePatterns ?? []).map((pattern) =>
      pattern.startsWith('/node_modules/(?!')
        ? pattern.replace('/node_modules/(?!', '/node_modules/(?!@nagiyu/)(?!')
        : pattern
    ),
  };
};

export default resolveConfig;
