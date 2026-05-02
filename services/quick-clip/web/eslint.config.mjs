import { fixupConfigRules } from '@eslint/compat';
import nextConfig from 'eslint-config-next';
import tseslint from 'typescript-eslint';

const eslintConfig = [
  ...fixupConfigRules(nextConfig.filter((c) => c.name !== 'next/typescript')),
  { languageOptions: { parser: tseslint.parser } },
  {
    rules: {
      // eslint-config-next 16.2.3で追加。既存コードへの影響が大きいため別途対応
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
    },
  },
];

export default eslintConfig;
