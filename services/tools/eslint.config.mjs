import { defineConfig, globalIgnores } from 'eslint/config';
import { fixupConfigRules } from '@eslint/compat';
import baseConfig from '../../configs/eslint.config.base.mjs';
import noRestrictedMui from '../../configs/eslint.config.no-restricted-mui.mjs';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

const eslintConfig = defineConfig([
  ...baseConfig,
  ...fixupConfigRules(nextVitals.filter((c) => c.name !== 'next/typescript')),
  { languageOptions: { parser: tseslint.parser } },
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
  {
    rules: {
      // eslint-config-next 16.2.3で追加。既存コードへの影響が大きいため別途対応
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
    },
  },
  noRestrictedMui,
]);

export default eslintConfig;
