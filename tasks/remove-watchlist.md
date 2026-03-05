# ウォッチリストの脱却

## 概要

ウォッチリスト機能は現状使われていないため、影響範囲を確認しながら段階的に削除する。

## 関連情報

-   Issue: #（ウォッチリストの脱却）
-   タスクタイプ: サービスタスク（stock-tracker）
-   対象サービス: `services/stock-tracker/`

## 要件

### 機能要件

-   FR1: ウォッチリスト機能（UI・API・コアロジック）をコードベースから削除する
-   FR2: ウォッチリストに依存している他機能（買いアラート設定フロー等）を整理し、機能維持または代替手段を設ける
-   FR3: ウォッチリスト関連の E2E・単体テストを削除または修正する
-   FR4: ドキュメント（`docs/services/stock-tracker/`配下）からウォッチリスト関連の記述を更新する

### 非機能要件

-   NFR1: 削除後もビルドが成功し、型エラーがないこと
-   NFR2: テストカバレッジ 80%以上を維持すること
-   NFR3: DynamoDB の既存データは削除しない（アプリケーション側での削除対応は不要）

## 影響範囲

### `services/stock-tracker/core/`

| ファイル | 対応 |
| --- | --- |
| `src/entities/watchlist.entity.ts` | 削除 |
| `src/repositories/watchlist.repository.interface.ts` | 削除 |
| `src/repositories/dynamodb-watchlist.repository.ts` | 削除（エラークラスを含む） |
| `src/repositories/in-memory-watchlist.repository.ts` | 削除 |
| `src/mappers/watchlist.mapper.ts` | 削除 |
| `src/types.ts` | `Watchlist` 型定義を削除、`DynamoDBItem.Type` から `'Watchlist'` を除去 |
| `src/validation/index.ts` | `validateWatchlist` 関数と `Watchlist` import を削除 |
| `src/index.ts` | ウォッチリスト関連の全 export を削除 |
| `tests/unit/repositories/dynamodb-watchlist.repository.test.ts` | 削除 |
| `tests/unit/repositories/in-memory-watchlist.repository.test.ts` | 削除 |
| `tests/unit/mappers/watchlist.mapper.test.ts` | 削除 |
| `tests/unit/validation/index.test.ts` | `validateWatchlist` 関連テストケースを削除 |

### `services/stock-tracker/web/`

| ファイル | 対応 |
| --- | --- |
| `app/watchlist/page.tsx` | ディレクトリごと削除 |
| `app/api/watchlist/route.ts` | ディレクトリごと削除 |
| `app/api/watchlist/[id]/route.ts` | ディレクトリごと削除 |
| `lib/repository-factory.ts` | `createWatchlistRepository`・`watchlistRepository` 変数・関連 import を削除 |
| `lib/error-messages.ts` | ウォッチリスト関連エラーメッセージ 3 件を削除 |
| `components/QuickActions.tsx` | ウォッチリストボタンを削除 |
| `components/ThemeRegistry.tsx` | ナビゲーションメニューのウォッチリスト項目を削除 |
| `tests/e2e/watchlist-management.spec.ts` | 削除 |
| `tests/e2e/alert-management.spec.ts` | `Watchlistからの買いアラート設定` describe ブロックを削除、関連 import を修正 |
| `tests/e2e/quick-actions.spec.ts` | ウォッチリストボタン関連のテストケースを削除 |
| `tests/e2e/navigation.spec.ts` | ウォッチリスト関連のテストケースを削除 |
| `tests/e2e/utils/test-data-factory.ts` | `createWatchlist`・`createAlertWithDependencies` のwatchlist分岐・`CreatedWatchlist`・関連型定義を削除 |
| `tests/helpers/cleanup.ts` | コメント内のウォッチリスト記述を更新 |
| `tests/unit/helpers/cleanup.test.ts` | 影響を確認・必要に応じて修正 |
| `tests/unit/lib/repository-factory.test.ts` | `createWatchlistRepository` 関連テストケースを削除 |

### `docs/`

| ファイル | 対応 |
| --- | --- |
| `docs/services/stock-tracker/requirements.md` | F-008 ウォッチリスト管理の記述を削除または「廃止」として更新 |
| `docs/services/stock-tracker/architecture.md` | ウォッチリスト関連の設計記述を削除 |
| `docs/services/stock-tracker/api-spec.md` | `/api/watchlist` エンドポイントを削除 |
| `docs/services/stock-tracker/testing.md` | ウォッチリスト関連のテスト記述を削除 |
| `docs/development/database-patterns.md` | ウォッチリスト関連の DB パターン記述を更新 |

## 実装のヒント

### 買いアラート設定フローへの影響

ウォッチリストページには「買いアラート」ボタンが存在しており、`AlertSettingsModal` を
呼び出して買いアラートを設定するフローが実装されている。このフローを削除することで、
買いアラートの設定手段がなくなる可能性がある。

以下の選択肢を検討すること:

-   **選択肢 A**: アラート一覧画面（`/alerts`）から直接買いアラートを設定できるよう機能を拡充する
-   **選択肢 B**: 保有株式管理画面（`/holdings`）から買いアラートを設定できるようにする
-   **選択肢 C**: ウォッチリスト削除と同時にアラート画面の UI を整備する（別 Issue に分離）

現状の `alert-management.spec.ts` ではウォッチリストから買いアラートを設定するフローの
E2E テストが存在するため、削除と同時に代替テストの追加が必要かどうかを判断すること。

### DynamoDB データの扱い

-   既存の DynamoDB データ（`SK: WATCHLIST#...` のアイテム）はアプリケーション側では削除しない
-   インフラ側（`infra/`）の CloudFormation/CDK テンプレートへの影響は現状なし（watchlist 参照なし）
-   将来的なデータクリーンアップは別途 DB 管理タスクとして実施を検討

### 段階的削除の順序（推奨）

依存関係を考慮し、以下の順序で削除を進めることを推奨する:

1.  UI 層（web/app/watchlist, QuickActions, ThemeRegistry）
2.  API 層（web/app/api/watchlist）
3.  Web 側ライブラリ（repository-factory, error-messages）
4.  Core 層（core/src 配下の entity/repository/mapper/validation）
5.  テスト（web/tests, core/tests）
6.  ドキュメント

## タスク

-   [ ] T001: UI 削除 - `app/watchlist/page.tsx` ディレクトリ、`QuickActions.tsx` のウォッチリストボタン、`ThemeRegistry.tsx` のナビゲーション項目を削除
-   [ ] T002: API 削除 - `app/api/watchlist/route.ts` および `app/api/watchlist/[id]/route.ts` を削除
-   [ ] T003: Web ライブラリ修正 - `lib/repository-factory.ts` の `createWatchlistRepository` 削除、`lib/error-messages.ts` のウォッチリスト関連エラーメッセージ削除
-   [ ] T004: Core 削除 - `entities/watchlist.entity.ts`、`repositories/watchlist.repository.interface.ts`、`repositories/dynamodb-watchlist.repository.ts`、`repositories/in-memory-watchlist.repository.ts`、`mappers/watchlist.mapper.ts` を削除
-   [ ] T005: Core 修正 - `types.ts` から `Watchlist` 型削除、`validation/index.ts` から `validateWatchlist` 削除、`index.ts` から watchlist export 削除
-   [ ] T006: E2E テスト修正 - `watchlist-management.spec.ts` 削除、`alert-management.spec.ts` のウォッチリスト関連テスト削除、`quick-actions.spec.ts` のウォッチリスト参照削除、`navigation.spec.ts` のウォッチリスト参照削除
-   [ ] T007: テストヘルパー修正 - `test-data-factory.ts` のウォッチリスト関連コード削除、`repository-factory.test.ts` のウォッチリスト関連テスト削除
-   [ ] T008: ユニットテスト削除 - `dynamodb-watchlist.repository.test.ts`、`in-memory-watchlist.repository.test.ts`、`watchlist.mapper.test.ts` を削除、`validation/index.test.ts` のウォッチリストテスト削除
-   [ ] T009: ビルド・テスト検証 - 全 workspace のビルド成功と型エラーなしを確認
-   [ ] T010: ドキュメント更新 - `requirements.md`、`architecture.md`、`api-spec.md`、`testing.md`、`database-patterns.md` を更新

## 参考ドキュメント

-   [Stock Tracker 要件定義](../docs/services/stock-tracker/requirements.md)
-   [Stock Tracker アーキテクチャ](../docs/services/stock-tracker/architecture.md)
-   [Stock Tracker API 仕様](../docs/services/stock-tracker/api-spec.md)
-   [コーディング規約](../docs/development/rules.md)
-   [データベースパターン](../docs/development/database-patterns.md)

## 備考・未決定事項

-   買いアラート設定フローの代替手段（選択肢 A/B/C）を事前に確認してから実装に着手すること
-   `createAlertWithDependencies` メソッドは `withHolding=false` の場合にウォッチリストを作成するため、削除後は `withHolding=true` のみ対応とするか、メソッド全体の見直しが必要
-   ウォッチリスト画面からのみ設定可能だった「買いアラート」の設定 UI を別途整備するか、現状のアラート一覧画面の拡充で対応するかの判断が必要
