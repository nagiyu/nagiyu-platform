import baseConfig from './eslint.config.base.mjs';

export default [
  ...baseConfig,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nagiyu/ui', '@nagiyu/browser', 'react', 'next', 'next/*'],
              message: 'core パッケージは UI/Browser に依存してはいけません',
            },
          ],
        },
      ],
    },
  },
];
