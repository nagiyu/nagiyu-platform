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
-   FR2: ウォッチリストに依存している他機能（アラート設定フロー等）のコードを整理する。買いアラート設定はサマリーページから引き続き可能なため代替実装は不要
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
呼び出して買いアラートを設定するフローが実装されている。

ただし、**サマリーページ（`app/summaries/page.tsx`）にも `AlertSettingsModal` を使った
買いアラート設定ボタン（`tradeMode="Buy"`）が既に実装されている**ため、ウォッチリストを
削除しても買いアラートを設定する手段は引き続き存在する。

したがって、以下の対応のみで十分:

-   ウォッチリストページのみに依存していた `alert-management.spec.ts` の
    `Watchlistからの買いアラート設定` describe ブロックを削除
-   サマリー画面からの買いアラート設定 E2E テストが既に存在するか確認し、不足があれば補完

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

-   [x] T001: UI 削除 - `app/watchlist/page.tsx` ディレクトリ、`QuickActions.tsx` のウォッチリストボタン、`ThemeRegistry.tsx` のナビゲーション項目を削除
-   [x] T002: API 削除 - `app/api/watchlist/route.ts` および `app/api/watchlist/[id]/route.ts` を削除
-   [x] T003: Web ライブラリ修正 - `lib/repository-factory.ts` の `createWatchlistRepository` 削除、`lib/error-messages.ts` のウォッチリスト関連エラーメッセージ削除
-   [x] T004: Core 削除 - `entities/watchlist.entity.ts`、`repositories/watchlist.repository.interface.ts`、`repositories/dynamodb-watchlist.repository.ts`、`repositories/in-memory-watchlist.repository.ts`、`mappers/watchlist.mapper.ts` を削除
-   [x] T005: Core 修正 - `types.ts` から `Watchlist` 型削除、`validation/index.ts` から `validateWatchlist` 削除、`index.ts` から watchlist export 削除
-   [x] T006: E2E テスト修正 - `watchlist-management.spec.ts` 削除、`alert-management.spec.ts` のウォッチリスト関連テスト削除、`quick-actions.spec.ts` のウォッチリスト参照削除、`navigation.spec.ts` のウォッチリスト参照削除
-   [x] T007: テストヘルパー修正 - `test-data-factory.ts` のウォッチリスト関連コードを全削除（`createWatchlist` メソッド・`CreatedWatchlist` 型・`CreateWatchlistOptions` 型・`TrackedData.watchlists` フィールドを削除）、`createAlertWithDependencies` メソッドは `withHolding` 引数を廃止しシンプルな `createAlert` 直呼び出しで代替できるよう**メソッド全体を見直し・削除**、`repository-factory.test.ts` の `createWatchlistRepository` 関連テストケースを削除
-   [x] T008: ユニットテスト削除 - `dynamodb-watchlist.repository.test.ts`、`in-memory-watchlist.repository.test.ts`、`watchlist.mapper.test.ts` を削除、`validation/index.test.ts` のウォッチリストテスト削除
-   [x] T009: ビルド・テスト検証 - 全 workspace のビルド成功と型エラーなしを確認
-   [x] T010: ドキュメント更新 - `requirements.md`、`architecture.md`、`api-spec.md`、`testing.md`、`database-patterns.md` を更新

## 参考ドキュメント

-   [Stock Tracker 要件定義](../docs/services/stock-tracker/requirements.md)
-   [Stock Tracker アーキテクチャ](../docs/services/stock-tracker/architecture.md)
-   [Stock Tracker API 仕様](../docs/services/stock-tracker/api-spec.md)
-   [コーディング規約](../docs/development/rules.md)
-   [データベースパターン](../docs/development/database-patterns.md)

## 備考・未決定事項

-   買いアラートの設定手段はサマリーページ（`app/summaries/page.tsx`）に既に実装済みのため、代替手段の追加は不要
-   `createAlertWithDependencies` メソッドは `withHolding=false` の場合にウォッチリストを作成していたが、ウォッチリスト削除に合わせてメソッド全体を廃止する。呼び出し側は `createHolding` + `createAlert` を直接呼ぶ形に書き直すこと（T007 参照）
