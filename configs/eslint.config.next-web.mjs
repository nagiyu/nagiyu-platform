import { defineConfig } from 'eslint/config';
import { fixupConfigRules } from '@eslint/compat';
import baseConfig from './eslint.config.base.mjs';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

// baseConfig 側の TypeScript 設定と重複して plugin 再定義エラーになるため、next/typescript は除外する
const compatibleNextVitals = fixupConfigRules(nextVitals).filter(
  (config) => config.name !== 'next/typescript'
);

export const nextWebCompatConfig = defineConfig([
  ...baseConfig,
  ...compatibleNextVitals,
  // ESLint v10 + eslint-config-next 互換維持のため、TypeScript parser を明示する
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
    },
  },
]);
