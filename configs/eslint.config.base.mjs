import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
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
  }
);
