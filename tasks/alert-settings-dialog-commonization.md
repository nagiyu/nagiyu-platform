# アラート設定ダイアログの共通化

## 概要

stock-tracker サービスにおいて、アラート設定に関するダイアログが各機能ページに分散して実装されている状況を改善する。
具体的には、`alerts/page.tsx` にインライン実装されているアラート編集ダイアログと削除確認ダイアログをコンポーネントとして切り出す。
さらに、既存の `AlertSettingsModal.tsx`（新規作成）と編集ダイアログは共通要素が多いため、**単一コンポーネントに統合**する方針とする。

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
- `AlertSettingsModal.tsx`（新規作成）と `alerts/page.tsx` のインライン編集ダイアログは、条件タイプ・オペレータ・対象価格・通知頻度など多くのフィールドを重複して持っている
- 今後、他のページやコンテキストでアラート編集・削除機能が必要になった場合に、コードを複製しなければならない
- アラート設定ロジックの変更がページごとに修正を必要とするリスクがある

### AlertSettingsModal と編集ダイアログの共通要素

| 表示要素 | 新規作成（AlertSettingsModal） | 編集（インライン） |
|---|---|---|
| モード（Buy/Sell） | 表示のみ | 表示のみ |
| ティッカー/銘柄 | 表示のみ | 表示のみ |
| 条件タイプ（単一/範囲） | 選択可 | 表示のみ |
| オペレータ（≥ / ≤） | 選択可 | 表示のみ（単一時のみ） |
| 対象価格 | 編集可（手動/割合） | 編集可（手動のみ） |
| 最小/最大価格 | 編集可（範囲時） | 表示のみ |
| 通知頻度 | 選択可 | 表示のみ |
| 有効/無効トグル | なし | あり（編集時固有） |
| Web Push 登録 | あり（新規作成時固有） | なし |
| パーセンテージ入力 | あり（新規作成時固有） | なし |

## 要件

### 機能要件

- FR1: `AlertSettingsModal.tsx` を `mode: 'create' | 'edit'` prop を持つ統合コンポーネントに拡張する
    - `mode='create'` 時: 現在の新規作成モードと同等（Web Push 登録・パーセンテージ入力・全フィールド編集）
    - `mode='edit'` 時: 既存アラートの編集モード（有効/無効トグル、条件値のみ編集可、Web Push なし）
    - `editTarget` prop に `AlertResponse` を受け取ることで編集対象のデータを初期表示する
- FR2: アラート削除確認ダイアログを `components/AlertDeleteConfirmDialog.tsx` として独立したコンポーネントに切り出す
- FR3: `alerts/page.tsx` は統合後のコンポーネントを利用し、既存の UI・動作を変更しない
- FR4: `watchlist/page.tsx` と `holdings/page.tsx` は既存の使い方（`mode='create'` 相当）のまま変更なし
- FR5: 各コンポーネントは props でデータと callbacks を受け取り、状態管理はページ側に委ねる

### 非機能要件

- NFR1: TypeScript strict mode 準拠、型定義は `types/` ディレクトリに集約
- NFR2: テストカバレッジ 80% 以上（新規・変更コンポーネントのユニットテスト追加・更新）
- NFR3: 既存の UI・動作（アラート新規作成・編集・削除の挙動）を変更しない
- NFR4: エラーメッセージは日本語 + `ERROR_MESSAGES` オブジェクトで定数化

## 実装のヒント

### コンポーネント設計方針

- `AlertSettingsModal` に `mode: 'create' | 'edit'` と `editTarget?: AlertResponse` を追加する
    - `mode='edit'` 時は `editTarget` の値でフォームを初期化する
    - `mode='edit'` 時は `PUT /api/alerts/{alertId}` を呼び出す
    - `mode='create'` 時は既存の動作（`POST /api/alerts`・Web Push 登録）をそのまま維持する
- 編集モード固有の表示（有効/無効トグル）は `mode === 'edit'` の条件分岐で制御する
- 新規作成モード固有の処理（Web Push 登録・パーセンテージ入力・範囲条件作成）は `mode === 'create'` の条件分岐で制御する
- `AlertDeleteConfirmDialog` は汎用的な確認ダイアログパターンで実装し、props でアラート情報と callbacks を受け取る

### 参考パターン

- 既存の `AlertSettingsModal.tsx` の props インターフェース（`open`, `onClose`, `onSuccess` など）を維持し拡張する
- MUI の `Dialog` / `DialogTitle` / `DialogContent` / `DialogActions` パターンを継続して使用する

## タスク

### Phase 1: AlertSettingsModal の統合拡張

- [ ] T001: `types/` ディレクトリの型定義を確認し、`AlertResponse` 型など必要な型を整理する
- [ ] T002: `AlertSettingsModal` に `mode: 'create' | 'edit'` と `editTarget?: AlertResponse` を props として追加する
- [ ] T003: `mode='edit'` 時のフォーム初期化ロジックを実装する（`editTarget` から `conditionValue`・`enabled` 等を設定）
- [ ] T004: `mode='edit'` 時の送信ロジックを実装する（`PUT /api/alerts/{alertId}`）
- [ ] T005: `mode='edit'` 固有の UI（有効/無効トグル、条件値のみ編集可）を条件分岐で実装する
- [ ] T006: `mode='create'` 固有の UI（Web Push・パーセンテージ入力・範囲作成）が `mode='edit'` 時に表示されないことを確認する

### Phase 2: AlertDeleteConfirmDialog の切り出し

- [ ] T007: `alerts/page.tsx` の削除確認ダイアログ部分を分析し、必要な props を定義する
- [ ] T008: `components/AlertDeleteConfirmDialog.tsx` を新規作成し、削除確認ダイアログを移植する

### Phase 3: alerts/page.tsx のリファクタ

- [ ] T009: `alerts/page.tsx` のインライン編集ダイアログを統合後の `AlertSettingsModal`（`mode='edit'`）に置き換える
- [ ] T010: `alerts/page.tsx` のインライン削除ダイアログを `AlertDeleteConfirmDialog` に置き換える

### Phase 4: テスト

- [ ] T011: `AlertSettingsModal` の `mode='create'` テストが引き続き通過することを確認する
- [ ] T012: `tests/unit/AlertSettingsModal.test.tsx` に `mode='edit'` ケースを追加する
- [ ] T013: `tests/unit/AlertDeleteConfirmDialog.test.tsx` を新規作成し、コンポーネントの動作をテストする

### Phase 5: 品質チェック

- [ ] T014: TypeScript コンパイルエラーがないことを確認する
- [ ] T015: ESLint エラーがないことを確認する
- [ ] T016: Prettier フォーマットが統一されていることを確認する
- [ ] T017: テストカバレッジが 80% 以上であることを確認する

## 参考ドキュメント

- `docs/development/rules.md` - コーディング規約
- `docs/development/architecture.md` - アーキテクチャ方針
- `docs/services/stock-tracker/architecture.md` - stock-tracker アーキテクチャ
- `docs/development/testing.md` - テスト戦略

## 備考・未決定事項

- `AlertSettingsModal` の統合によりコンポーネントのサイズが増加する。`mode` による条件分岐が複雑になりすぎる場合は、共通のダイアログシェルを持つ上で内部のフォームロジックを `AlertCreateForm` / `AlertEditForm` として分離することを検討する。
- `AlertDeleteConfirmDialog` は stock-tracker 固有の削除確認として実装するが、将来的に汎用確認ダイアログ（`@nagiyu/ui` ライブラリ）に昇格させることも検討できる。

