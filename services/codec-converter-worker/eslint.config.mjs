import tseslint from 'typescript-eslint';

const eslintConfig = tseslint.config(...tseslint.configs.recommended, {
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
});

export default eslintConfig;
