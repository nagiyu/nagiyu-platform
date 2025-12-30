import { defineConfig, globalIgnores } from 'eslint/config';
import baseConfig from '../../configs/eslint.config.base.mjs';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...baseConfig,
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // E2E and test files:
    'e2e/**',
    '__tests__/**',
  ]),
]);

export default eslintConfig;
