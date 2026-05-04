# 共通 UI コンポーネント整備 - 作業ドキュメント

<!--
    このディレクトリは開発時の一時ドキュメントです。
    全 Phase 完了後、永続化すべき内容を docs/development/shared-ui-components.md に
    反映済みであることを確認してから削除します。
-->

## 概要

Issue: [#2900](https://github.com/nagiyu/nagiyu-platform/issues/2900)

本タスクでは、各サービスが MUI を直接利用している現状を改め、`libs/ui/` に共通コンポーネントを集約する。将来の MUI 差し替えを見据えて、Props はライブラリ非依存の独自設計とする。

永続仕様は [`docs/development/shared-ui-components.md`](../../docs/development/shared-ui-components.md) に整理済み。本ディレクトリは **作業中の進捗管理・決定経緯・移行作業ログ** のみを保持する。

## ドキュメント構成

| ファイル | 役割 |
|---|---|
| `README.md` | 本ファイル。全体概要 |
| `decisions.md` | 設計議論の決定経緯。「なぜそう決めたか」のログ |
| `tasks.md` | Phase 別のタスクリスト（チェックボックス形式） |
| `component-mapping.md` | MUI コンポーネント → 共通部品の対応表（移行作業用） |

## 現在の Phase

- [x] **Phase 0-5**: ガバナンス文書化（本 PR）
- [ ] Phase 0-1: デザイントークン基盤
- [ ] Phase 0-2: Storybook 導入
- [ ] Phase 0-3: CDK スタック追加
- [ ] Phase 0-4: テスト基盤強化
- [ ] Phase 1: Button / TextField / Checkbox / Chip / Link
- [ ] Phase 2: Select 系
- [ ] Phase 3: Card / Tabs / List
- [ ] Phase 4: Snackbar / Pagination / Badge / Paper

詳細は [`tasks.md`](./tasks.md) を参照。

## 完了条件

[`docs/development/shared-ui-components.md`](../../docs/development/shared-ui-components.md) と Issue #2900 の完了条件を満たすこと。完了時には本ディレクトリを削除する。
