import { defineConfig, globalIgnores } from 'eslint/config';
import { fixupConfigRules } from '@eslint/compat';
import baseConfig from '../../configs/eslint.config.base.mjs';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

// baseConfig 側の TypeScript 設定と重複して plugin 再定義エラーになるため、next/typescript は除外する
const compatibleNextVitals = fixupConfigRules(nextVitals).filter(
  (config) => config.name !== 'next/typescript'
);

const eslintConfig = defineConfig([
  ...baseConfig,
  ...compatibleNextVitals,
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
    },
  },
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
