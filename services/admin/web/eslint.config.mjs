import { defineConfig, globalIgnores } from 'eslint/config';
import baseConfig from '../../../configs/eslint.config.base.mjs';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...baseConfig,
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // E2E test files:
    'e2e/**',
  ]),
]);

export default eslintConfig;
