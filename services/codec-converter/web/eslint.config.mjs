import { fixupConfigRules } from '@eslint/compat';
import nextConfig from 'eslint-config-next';
import tseslint from 'typescript-eslint';

const eslintConfig = [
  ...fixupConfigRules(nextConfig.filter((c) => c.name !== 'next/typescript')),
  { languageOptions: { parser: tseslint.parser } },
];

export default eslintConfig;
