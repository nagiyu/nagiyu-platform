module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  // Common coverage settings
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['lib/**/*.{ts,js}', '!lib/**/*.d.ts'],
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
