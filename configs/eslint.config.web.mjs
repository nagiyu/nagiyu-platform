import { defineConfig, globalIgnores } from 'eslint/config';
import { fixupConfigRules } from '@eslint/compat';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';
import baseConfig from './eslint.config.base.mjs';
import noRestrictedMui from './eslint.config.no-restricted-mui.mjs';

/**
 * Next.js Web サービス共通の ESLint 設定。
 *
 * 各サービスの `eslint.config.mjs` から spread して使い、サービス固有の差分だけを追記する。
 * E2E (`tests/e2e/`) も lint 対象にそろえるため、除外には含めない。
 * `next/typescript` を除くのは、typescript-eslint のルールを base 側で管理しているため。
 */
export default defineConfig([
  ...baseConfig,
  ...fixupConfigRules(nextVitals.filter((c) => c.name !== 'next/typescript')),
  { languageOptions: { parser: tseslint.parser } },
  // eslint-config-next の既定の除外を上書きする際に失われないよう明示する
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
  {
    rules: {
      // eslint-config-next 16.2.3で追加。既存コードへの影響が大きいため別途対応
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
    },
  },
  noRestrictedMui,
]);
