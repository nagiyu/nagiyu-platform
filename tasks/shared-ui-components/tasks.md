# 実装タスク

<!--
    本ドキュメントは Phase 別の実装タスクを管理する。
    各 Phase の完了時にチェックを更新する。
-->

## Phase 0: 基盤整備

### PR 0-5: ガバナンス文書化

- [x] `docs/development/shared-ui-components.md` を作成
- [x] `tasks/shared-ui-components/` 配下にワーキングドキュメントを作成
- [ ] PR 作成・レビュー・マージ

### PR 0-1: デザイントークン基盤

- [x] `libs/ui/src/styles/tokens.css` で Primitive + Semantic の CSS 変数を定義
- [x] `libs/ui/src/styles/tokens.ts` で TS 型定義と参照ヘルパーを実装
- [x] ライト・ダークモード切替を `[data-theme]` で実現
- [x] 既存 `libs/ui/src/styles/theme.ts` を可能な範囲で CSS 変数参照に書き換え（palette は MUI の制約で具体値を維持）
- [x] `libs/ui/package.json` の exports に `./tokens` / `./tokens.css` を追加、ビルド時に CSS を dist/ へ複製
- [x] `services/portal/web/src/app/layout.tsx` で `@nagiyu/ui/tokens.css` を import
- [x] 既存テストが通過することを確認（135 テスト全成功）

### PR 0-2: Storybook 導入

- [x] `libs/ui` に Storybook v10 + Vite ビルダーを導入
- [x] グローバル設定（`addon-themes` でライト/ダーク切替、`addon-a11y` でアクセシビリティチェック）
- [x] サンプルとして既存コンポーネント（`ErrorAlert`）の Stories を作成
- [x] `npm run storybook` / `npm run build-storybook` のスクリプト追加
- [x] tsconfig.json で `*.stories.{ts,tsx}` を build 対象から除外
- [x] .gitignore に `storybook-static/` を追加
- [x] Storybook 関連 deps を root devDependencies に配置（npm workspaces の hoisting 制約対応）

### PR 0-3: CDK スタック追加

- [x] `infra/ui-storybook/` 配下に CDK スタックを作成（package / cdk.json / tsconfig / bin / lib）
- [x] S3（OAC, public access ブロック）+ CloudFront による静的サイト配信
- [x] 共有 ACM 証明書（`*.nagiyu.com` ワイルドカード）を SSM 経由で参照
- [x] Route53 hosted zone を SSM 経由で参照し、CloudFront 向け ALIAS A レコードをスタック内で自動生成（Issue #2919 の最終形に準拠）
- [x] BucketDeployment による静的サイトアップロード + CloudFront キャッシュ無効化
- [x] CI で Storybook をビルドし dev デプロイ（`.github/workflows/ui-storybook-deploy.yml`）
- [x] ローカルで `cdk synth` 成功を確認
- [ ] dev デプロイ完了後にブラウザで動作確認

### PR 0-4: テスト基盤強化

- [ ] `jest-axe` を `libs/ui` に導入
- [ ] `libs/ui/jest.config.ts` のカバレッジ閾値を 90% に変更（branches は 85%）
- [ ] サンプルとして既存コンポーネントに a11y テストを 1 つ追加
- [ ] `tests/visual/` 配下の Playwright ビジュアルリグレッション基盤（基本構造のみ、本格運用は Phase 1 以降）

---

## Phase 1: アトミックコンポーネント

### Button

- [ ] PR 1-1-A: `libs/ui` に `Button` 実装（variant: solid/outline/ghost、color: 6 種、size: sm/md/lg、`loading`、`asChild`）
- [ ] PR 1-1-A: Stories 全パターン作成
- [ ] PR 1-1-A: ユニット + a11y テスト（カバレッジ 90%）
- [ ] PR 1-1-B: 全サービスで MUI `Button` → `@nagiyu/ui` の `Button` に置換
- [ ] PR 1-1-C: ESLint で `@mui/material` の `Button` 直接 import を禁止

### TextField

- [ ] PR 1-2-A: `libs/ui` に `TextField` 実装
- [ ] PR 1-2-A: Stories + テスト
- [ ] PR 1-2-B: 全サービスで置換
- [ ] PR 1-2-C: ESLint 禁止追加

### Checkbox

- [ ] PR 1-3-A: 実装 + Stories + テスト
- [ ] PR 1-3-B: 置換
- [ ] PR 1-3-C: ESLint 禁止追加

### Chip

- [ ] PR 1-4-A: 実装 + Stories + テスト
- [ ] PR 1-4-B: 置換
- [ ] PR 1-4-C: ESLint 禁止追加

### Link

- [ ] PR 1-5-A: 実装 + Stories + テスト
- [ ] PR 1-5-B: 置換
- [ ] PR 1-5-C: ESLint 禁止追加

---

## Phase 2: フォーム系

### Select

- [ ] PR 2-1-A: `libs/ui` に `Select` 実装（MUI の `FormControl` / `MenuItem` / `InputLabel` を統合）
- [ ] PR 2-1-A: Stories + テスト
- [ ] PR 2-1-B: 全サービスで置換
- [ ] PR 2-1-C: ESLint 禁止追加（`Select` / `MenuItem` / `FormControl` / `InputLabel`）

---

## Phase 3: 構造系（コンポジション API）

### Card

- [ ] PR 3-1-A: `Card` + `Card.Header` + `Card.Body` + `Card.Actions` を Compound Components で実装
- [ ] PR 3-1-A: Stories + テスト
- [ ] PR 3-1-B: 全サービスで置換
- [ ] PR 3-1-C: ESLint 禁止追加

### Tabs

- [ ] PR 3-2-A: `Tabs` + `Tabs.List` + `Tabs.Trigger` + `Tabs.Content` を Compound Components で実装
- [ ] PR 3-2-A: Stories + テスト
- [ ] PR 3-2-B: 全サービスで置換
- [ ] PR 3-2-C: ESLint 禁止追加

### List

- [ ] PR 3-3-A: `List` + `List.Item` を実装
- [ ] PR 3-3-A: Stories + テスト
- [ ] PR 3-3-B: 全サービスで置換
- [ ] PR 3-3-C: ESLint 禁止追加

---

## Phase 4: フィードバック・ナビゲーション系

### Snackbar

- [ ] PR 4-1-A: 実装 + Stories + テスト
- [ ] PR 4-1-B: 置換
- [ ] PR 4-1-C: ESLint 禁止追加

### Pagination

- [ ] PR 4-2-A: 実装 + Stories + テスト
- [ ] PR 4-2-B: 置換
- [ ] PR 4-2-C: ESLint 禁止追加

### Badge

- [ ] PR 4-3-A: 実装 + Stories + テスト
- [ ] PR 4-3-B: 置換
- [ ] PR 4-3-C: ESLint 禁止追加

### Paper

- [ ] PR 4-4-A: 実装 + Stories + テスト
- [ ] PR 4-4-B: 置換
- [ ] PR 4-4-C: ESLint 禁止追加

---

## 完了チェック

全 Phase 完了後、以下を確認してから本ディレクトリを削除する。

- [ ] Issue #2900 の完了条件をすべて満たしている
- [ ] `libs/ui` のテストカバレッジが 90% 以上を維持している
- [ ] ESLint で対象 MUI コンポーネントの直接 import がエラーになる
- [ ] `docs/development/shared-ui-components.md` に永続化すべき内容が反映されている
- [ ] `decisions.md` の重要な決定根拠が `docs/` 側に必要に応じて統合されている
- [ ] `tasks/shared-ui-components/` ディレクトリを削除
