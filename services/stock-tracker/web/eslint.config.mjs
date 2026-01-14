import baseConfig from '../../../configs/eslint.config.base.mjs';
// @ts-ignore - next package might not have types
import nextVitals from 'eslint-config-next/core-web-vitals';
// @ts-ignore - next package might not have types
import nextTs from 'eslint-config-next/typescript';

export default [
  ...baseConfig,
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['.next/', 'dist/', 'coverage/', 'playwright-report/', 'test-results/'],
  },
];
