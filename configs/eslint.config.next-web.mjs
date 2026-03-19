import { defineConfig } from 'eslint/config';
import { fixupConfigRules } from '@eslint/compat';
import baseConfig from './eslint.config.base.mjs';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

const compatibleNextVitals = fixupConfigRules(nextVitals).filter(
  (config) => config.name !== 'next/typescript'
);

export const nextWebCompatConfig = defineConfig([
  ...baseConfig,
  ...compatibleNextVitals,
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
    },
  },
]);
