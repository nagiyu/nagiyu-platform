import { defineConfig, globalIgnores } from 'eslint/config';
import baseConfig from '../../../../configs/eslint.config.base.mjs';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...baseConfig,
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'e2e/**']),
]);

export default eslintConfig;
