import { defineConfig, globalIgnores } from 'eslint/config';
import { nextWebCompatConfig } from '../../../configs/eslint.config.next-web.mjs';

const eslintConfig = defineConfig([
  ...nextWebCompatConfig,
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
