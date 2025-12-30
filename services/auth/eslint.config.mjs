import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.next/**',
      'out/**',
      'next-env.d.ts',
      'e2e/**',
      '__tests__/**',
      'playwright.config.ts',
      'jest.config.ts',
      'jest.setup.ts',
    ],
  },
);
