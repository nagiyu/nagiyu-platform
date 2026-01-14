import baseConfig from '../../../configs/eslint.config.base.mjs';
// @ts-expect-error - next package might not have types
import nextVitals from 'eslint-config-next/core-web-vitals';
// @ts-expect-error - next package might not have types
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...baseConfig,
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['.next/', 'dist/', 'coverage/', 'playwright-report/', 'test-results/'],
  },
];

export default config;
