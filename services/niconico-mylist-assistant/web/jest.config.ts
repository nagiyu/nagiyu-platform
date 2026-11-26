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
    '^@nagiyu/niconico-mylist-assistant-core$': '<rootDir>/../core/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  modulePathIgnorePatterns: ['<rootDir>/../../../package.json', '<rootDir>/.next/'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/app/layout.tsx',
    'src/app/api/auth/[...nextauth]/route.ts',
    'src/components/HomePageClient.tsx',
    'src/components/NiconicoSessionManager.tsx',
    'src/components/VideoList.tsx',
    'src/components/VideoSearchModal.tsx',
    'src/components/VideoDetailModal.tsx',
    'src/lib/niconico-session/index.ts',
    'src/lib/constants/errors.ts',
    'src/app/api/niconico/session/route.ts',
    'src/app/api/mylist/register/route.ts',
    'src/app/api/videos/bulk-import/route.ts',
    'src/app/api/videos/[id]/settings/route.ts',
    'src/app/api/batch/status/[jobId]/route.ts',
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
