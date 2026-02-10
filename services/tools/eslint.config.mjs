import { defineConfig, globalIgnores } from 'eslint/config';
import { fixupConfigRules } from '@eslint/compat';
import baseConfig from '../../configs/eslint.config.nextjs.mjs';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// ESLint 10.x 対応: eslint-config-next が正式に ESLint 10 をサポートするまで
// @eslint/compat を使用して互換性を確保
const eslintConfig = defineConfig([
  ...baseConfig,
  ...fixupConfigRules(nextVitals),
  ...fixupConfigRules(nextTs),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // PWA generated files:
    'public/sw.js',
    'public/workbox-*.js',
    // E2E test files:
    'e2e/**',
  ]),
]);

export default eslintConfig;
