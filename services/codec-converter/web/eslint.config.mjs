import { defineConfig, globalIgnores } from 'eslint/config';
import { nextWebCompatConfig } from '../../../configs/eslint.config.next-web.mjs';

const eslintConfig = defineConfig([
  ...nextWebCompatConfig,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'e2e/**']),
]);

export default eslintConfig;
