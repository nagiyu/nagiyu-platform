import eslint from '@eslint/js';

// ESLint 10.x 対応: Next.js プロジェクト用の基本設定
// eslint-config-next が typescript-eslint を含んでいるため、
// ここでは typescript-eslint を含めずに基本ルールのみを提供
export default [
  eslint.configs.recommended,
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', '.next/**', 'out/**'],
  },
];
