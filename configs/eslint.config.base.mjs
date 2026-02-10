import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

// ESLint 10.x 対応: typescript-eslint が正式に ESLint 10 をサポートするまで
// 暫定的に ESLint 10 を使用（--legacy-peer-deps でインストール）
export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', '.next/**', 'out/**'],
  },
  {
    rules: {
      // TypeScriptのフィールドはコンストラクタで定義しないこと
      '@typescript-eslint/parameter-properties': [
        'error',
        {
          prefer: 'class-property',
        },
      ],
      // アクセス修飾子は必ず付けること
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
          accessibility: 'explicit',
          overrides: {
            constructors: 'no-public',
          },
        },
      ],
    },
  },
];
