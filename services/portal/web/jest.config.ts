import type { Config } from 'jest';
import nextJest from 'next/jest.js';

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
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@nagiyu/ui$': '<rootDir>/../../libs/ui/src/index.ts',
    '^@nagiyu/browser$': '<rootDir>/../../libs/browser/src/index.ts',
    '^@nagiyu/common$': '<rootDir>/../../libs/common/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Exclude E2E tests from Jest (they use Playwright)
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  // Exclude monorepo root and build artifacts from module scanning
  modulePathIgnorePatterns: ['<rootDir>/../../package.json', '<rootDir>/.next/'],
  // Common coverage settings
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/lib/**/*.{ts,tsx}', '!src/**/*.d.ts'],
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

// remark / rehype 系は ESM-only のため Jest の transform 対象に含める
// next/jest が設定する transformIgnorePatterns のデフォルトを上書きするために
// createJestConfig() の後で書き換える
const ESM_PACKAGES = [
  'remark',
  'remark-gfm',
  'remark-rehype',
  'rehype',
  'rehype-stringify',
  'unified',
  'bail',
  'trough',
  'is-plain-obj',
  'micromark.*',
  'mdast-util.*',
  'hast-util.*',
  'unist-util.*',
  'vfile.*',
  'decode-named-character-reference',
  'character-entities.*',
  'character-reference-invalid',
  'ccount',
  'escape-string-regexp',
  'markdown-table',
  'zwitch',
  'longest-streak',
  'html-void-elements',
  'stringify-entities',
  'space-separated-tokens',
  'comma-separated-tokens',
  'property-information',
  'web-namespaces',
  'fault',
  'devlop',
].join('|');

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default async () => {
  const baseConfig = await createJestConfig(config)();
  return {
    ...baseConfig,
    transformIgnorePatterns: [`/node_modules/(?!(${ESM_PACKAGES})/)`],
  };
};
