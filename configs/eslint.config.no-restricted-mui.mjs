/**
 * `@mui/material` の共通ラップ済みコンポーネントを直接 import するのを禁止する設定。
 *
 * 各サービスの `eslint.config.mjs` から spread して使うことで、`services/*` 配下のみに
 * 適用され、`libs/ui` 内部（MUI を直接利用する必要がある）には影響しない。
 *
 * 対象を増やす場合（PR 1-2-C 以降）は `paths.importNames` と `patterns.group` の両方に
 * コンポーネント名を追加すること。例外的に MUI を直接使いたい場合は、当該行に
 * `// eslint-disable-next-line no-restricted-imports -- 理由` を付与すること。
 *
 * `FormControl` は Select の構成要素として共通 Select に統合済みだが、Radio グループ
 * 用途（`<FormControl component="fieldset">` で fieldset/legend セマンティクスを得る）
 * では共通化対象外。該当箇所では disable コメント + 理由で例外運用する。
 * `MenuItem` も同様に MUI Menu（dropdown）の子要素用途では共通化対象外で、Menu 配下
 * での利用は disable コメント + 理由で例外運用する。
 */
export default {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@mui/material',
            importNames: [
              'Button',
              'TextField',
              'Checkbox',
              'Chip',
              'Link',
              'Select',
              'MenuItem',
              'FormControl',
              'InputLabel',
            ],
            message: '共通コンポーネントは @nagiyu/ui から import してください',
          },
        ],
        patterns: [
          {
            group: [
              '@mui/material/Button',
              '@mui/material/Button/*',
              '@mui/material/TextField',
              '@mui/material/TextField/*',
              '@mui/material/Checkbox',
              '@mui/material/Checkbox/*',
              '@mui/material/Chip',
              '@mui/material/Chip/*',
              '@mui/material/Link',
              '@mui/material/Link/*',
              '@mui/material/Select',
              '@mui/material/Select/*',
              '@mui/material/MenuItem',
              '@mui/material/MenuItem/*',
              '@mui/material/FormControl',
              '@mui/material/FormControl/*',
              '@mui/material/InputLabel',
              '@mui/material/InputLabel/*',
            ],
            message: '共通コンポーネントは @nagiyu/ui から import してください',
          },
        ],
      },
    ],
  },
};
