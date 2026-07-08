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
    '^@nagiyu/react$': '<rootDir>/../../../libs/react/src/index.ts',
    '^@nagiyu/aws$': '<rootDir>/../../../libs/aws/src/index.ts',
    '^@nagiyu/niconico-mylist-assistant-core$': '<rootDir>/../core/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  modulePathIgnorePatterns: ['<rootDir>/../../../package.json', '<rootDir>/.next/'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/components/HomePageClient.tsx',
    'src/components/NiconicoSessionManager.tsx',
    'src/components/VideoSearchModal.tsx',
    'src/lib/niconico-session/index.ts',
    'src/lib/constants/errors.ts',
    'src/app/api/niconico/session/route.ts',
    'src/app/api/mylist/register/route.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  passWithNoTests: false,
};

export default createJestConfig(config);
