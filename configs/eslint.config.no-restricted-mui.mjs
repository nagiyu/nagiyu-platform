/**
 * `@mui/material` の共通ラップ済みコンポーネントを直接 import するのを禁止する設定。
 *
 * 各サービスの `eslint.config.mjs` から spread して使うことで、`services/*` 配下のみに
 * 適用され、`libs/ui` 内部（MUI を直接利用する必要がある）には影響しない。
 *
 * 対象を増やす場合（PR 1-2-C 以降）は `paths.importNames` と `patterns.group` の両方に
 * コンポーネント名を追加すること。例外的に MUI を直接使いたい場合は、当該行に
 * `// eslint-disable-next-line no-restricted-imports -- 理由` を付与すること。
 */
export default {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@mui/material',
            importNames: ['Button'],
            message: '共通コンポーネントは @nagiyu/ui から import してください',
          },
        ],
        patterns: [
          {
            group: ['@mui/material/Button', '@mui/material/Button/*'],
            message: '共通コンポーネントは @nagiyu/ui から import してください',
          },
        ],
      },
    ],
  },
};
