# アラート設定ダイアログの共通化

## 概要

stock-tracker サービスにおいて、アラート設定に関するダイアログが各機能ページに分散して実装されている状況を改善する。
具体的には、`alerts/page.tsx` にインライン実装されているアラート編集ダイアログと削除確認ダイアログをコンポーネントとして切り出し、メンテナンス性・再利用性を向上させる。

## 関連情報

- Issue: TBD（アラート設定ダイアログの共通化）
- タスクタイプ: サービスタスク（stock-tracker-web）
- 対象サービス: `services/stock-tracker/web`

## 現状分析

### 既存のアラートダイアログ実装

現在、stock-tracker の UI には以下の 3 種類のアラート関連ダイアログが存在する。

| コンポーネント/実装箇所 | 目的 | 形態 |
|---|---|---|
| `components/AlertSettingsModal.tsx` | アラート新規作成（ウォッチリスト・保有銘柄） | 共通コンポーネント（既に共通化済み） |
| `app/alerts/page.tsx`（インライン実装） | 既存アラートの編集 | ページ内インライン実装 |
| `app/alerts/page.tsx`（インライン実装） | 既存アラートの削除確認 | ページ内インライン実装 |

### 問題点

- `alerts/page.tsx` がアラート編集ダイアログ（約 150 行）と削除確認ダイアログ（約 60 行）をインラインで持っており、ページファイルが肥大化している
- 今後、他のページやコンテキストでアラート編集・削除機能が必要になった場合に、コードを複製しなければならない
- アラート設定ロジックの変更がページごとに修正を必要とするリスクがある

## 要件

### 機能要件

- FR1: アラート編集ダイアログを `components/AlertEditModal.tsx` として独立したコンポーネントに切り出す
- FR2: アラート削除確認ダイアログを `components/AlertDeleteConfirmDialog.tsx` として独立したコンポーネントに切り出す
- FR3: `alerts/page.tsx` は切り出したコンポーネントを利用し、既存の UI・動作を変更しない
- FR4: 各コンポーネントは props でデータと callbacks を受け取り、状態管理はページ側に委ねる

### 非機能要件

- NFR1: TypeScript strict mode 準拠、型定義は `types/` ディレクトリに集約
- NFR2: テストカバレッジ 80% 以上（新規コンポーネントのユニットテスト追加）
- NFR3: 既存の UI・動作（アラート編集・削除の挙動）を変更しない
- NFR4: エラーメッセージは日本語 + `ERROR_MESSAGES` オブジェクトで定数化

## 実装のヒント

### コンポーネント設計方針

- `AlertEditModal` は現状の編集フォームのロジックをそのまま移植する形とし、過度な抽象化は避ける
- `AlertDeleteConfirmDialog` は汎用的な確認ダイアログパターンで実装する
- 既存の `AlertSettingsModal.tsx` との命名・props パターンを揃えて一貫性を持たせる

### 参考パターン

- 既存の `AlertSettingsModal.tsx` の props インターフェース（`open`, `onClose`, `onSuccess` など）を参考に統一する
- MUI の `Dialog` / `DialogTitle` / `DialogContent` / `DialogActions` パターンを継続して使用する

## タスク

### Phase 1: コンポーネント切り出し

- [ ] T001: `alerts/page.tsx` の編集ダイアログ部分のロジック・JSX を分析し、必要な props を定義する
- [ ] T002: `components/AlertEditModal.tsx` を新規作成し、編集ダイアログを移植する
- [ ] T003: `alerts/page.tsx` の削除確認ダイアログ部分を分析し、必要な props を定義する
- [ ] T004: `components/AlertDeleteConfirmDialog.tsx` を新規作成し、削除確認ダイアログを移植する
- [ ] T005: `alerts/page.tsx` を更新し、インライン実装を新規コンポーネントの利用に置き換える

### Phase 2: テスト

- [ ] T006: `tests/unit/AlertEditModal.test.tsx` を新規作成し、コンポーネントの動作をテストする
- [ ] T007: `tests/unit/AlertDeleteConfirmDialog.test.tsx` を新規作成し、コンポーネントの動作をテストする
- [ ] T008: 既存の `alerts/page.tsx` 関連テスト（存在する場合）がリファクタ後も通過することを確認する

### Phase 3: 品質チェック

- [ ] T009: TypeScript コンパイルエラーがないことを確認する
- [ ] T010: ESLint エラーがないことを確認する
- [ ] T011: Prettier フォーマットが統一されていることを確認する
- [ ] T012: テストカバレッジが 80% 以上であることを確認する

## 参考ドキュメント

- `docs/development/rules.md` - コーディング規約
- `docs/development/architecture.md` - アーキテクチャ方針
- `docs/services/stock-tracker/architecture.md` - stock-tracker アーキテクチャ
- `docs/development/testing.md` - テスト戦略

## 備考・未決定事項

- `AlertSettingsModal`（新規作成）と `AlertEditModal`（既存編集）は別の目的を持つため、現状は統合しない方針とする。ただし、将来的なリファクタ時に共通基盤（BaseAlertDialog）を検討する余地がある。
- `AlertDeleteConfirmDialog` は stock-tracker 固有の削除確認として実装するが、将来的に汎用確認ダイアログ（`@nagiyu/ui` ライブラリ）に昇格させることも検討できる。
