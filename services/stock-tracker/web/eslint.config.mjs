import baseConfig from '../../../configs/eslint.config.base.mjs';
import { defineConfig, globalIgnores } from 'eslint/config';
import { fixupConfigRules } from '@eslint/compat';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

const eslintConfig = defineConfig([
  ...baseConfig,
  ...fixupConfigRules([...nextVitals].filter((c) => c.name !== 'next/typescript')),
  { languageOptions: { parser: tseslint.parser } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
