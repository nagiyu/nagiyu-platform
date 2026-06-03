import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '\\.module\\.css$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@nagiyu/ui$': '<rootDir>/../../../libs/ui/src/index.ts',
    '^@nagiyu/browser$': '<rootDir>/../../../libs/browser/src/index.ts',
    '^@nagiyu/common$': '<rootDir>/../../../libs/common/src/index.ts',
    '^@nagiyu/nextjs$': '<rootDir>/../../../libs/nextjs/src/index.ts',
    '^@nagiyu/livetalk-core$': '<rootDir>/../core/src/index.ts',
    '^@nagiyu/aws$': '<rootDir>/../../../libs/aws/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],
  modulePathIgnorePatterns: ['<rootDir>/../../../package.json', '<rootDir>/.next/'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/lib/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/lib/legal/**',
    // 型定義のみのモジュール（ランタイムコードなし）はカバレッジ対象外
    '!src/lib/memory/types.ts',
    '!src/lib/notes/types.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  passWithNoTests: true,
};

export default createJestConfig(config);
