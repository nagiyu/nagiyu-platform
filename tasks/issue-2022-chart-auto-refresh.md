# チャート自動更新機能追加

## 概要

Stock Tracker のチャート画面に、10秒毎にチャートデータを自動更新する機能を追加する。
強制的な自動更新はユーザーの操作を妨げる可能性があるため、ユーザーが明示的にオン/オフできる「自動更新ボタン」を設ける。

## 関連情報

-   Issue: #2022
-   タスクタイプ: サービスタスク（Stock Tracker Web）
-   対象ディレクトリ: `services/stock-tracker/web/`

## 要件

### 機能要件

-   FR1: チャート表示エリアに「自動更新」トグルボタンを追加する
-   FR2: 自動更新が有効な間、10秒ごとにチャートデータを再取得・再描画する
-   FR3: ティッカーが未選択の場合は自動更新を開始しない
-   FR4: 取引所またはティッカーを変更したとき、自動更新の有効/無効状態を維持する
-   FR5: 自動更新中であることをユーザーに視覚的にフィードバックする（例: ボタン状態の変化）
-   FR6: コンポーネントがアンマウントされたときはタイマーをクリアする（メモリリーク防止）

### 非機能要件

-   NFR1: 自動更新のインターバルは定数（`AUTO_REFRESH_INTERVAL_MS`）で管理する。定数は `services/stock-tracker/web/lib/constants.ts`（新規作成）に配置する
-   NFR2: テストカバレッジ 80% 以上を維持する
-   NFR3: アクセシビリティ: ボタンに `aria-label`、`aria-pressed` を付与する

## 実装のヒント

### 変更対象ファイル

-   `services/stock-tracker/web/components/StockChart.tsx`
    -   `useEffect` + `setInterval` による定期更新ロジックを追加
    -   `autoRefresh` プロパティを受け取り、有効時のみタイマーを起動する
-   `services/stock-tracker/web/components/HomePageClient.tsx`
    -   `autoRefresh` 状態を管理し、トグルボタンを追加
    -   `StockChart` コンポーネントに `autoRefresh` プロパティを渡す

### 設計上の考慮事項

-   `StockChart` に `autoRefresh: boolean` プロパティを追加し、コンポーネント内部でタイマーを管理する（`StockChart` が自身の再描画タイミングを制御できるため、`HomePageClient` との疎結合性が保たれる）
-   `setInterval` + `clearInterval` を `useEffect` の cleanup 関数で確実に解放する
-   タイマーは `tickerId` / `timeframe` / `count` が変わった場合にリセットする（依存配列の管理）
-   自動更新中に手動でドロップダウンを操作してもユーザー体験を損なわないようにする

### UIコンポーネント

-   Material-UI の `IconButton`（`PlayArrow` / `Pause` アイコン）または `Tooltip` 付き `Switch` が候補
-   チャートエリア（`Paper` コンポーネント）の上部に配置する

## タスク

-   [x] T001: `StockChart` に `autoRefresh?: boolean` プロパティを追加し、`useEffect` でタイマー管理を実装する
-   [x] T002: `HomePageClient` に `autoRefresh` 状態を追加し、トグルボタンを実装する
-   [x] T003: `AUTO_REFRESH_INTERVAL_MS` 定数を `lib/constants.ts`（新規作成）に追加する
-   [x] T004: `StockChart` のユニットテストを更新・追加する（自動更新の開始・停止・クリーンアップ）
-   [x] T005: E2E テストを追加する（自動更新ボタンの表示・動作確認）
-   [x] T006: テストカバレッジが 80% 以上であることを確認する

## 参考ドキュメント

-   [Stock Tracker アーキテクチャ](../docs/services/stock-tracker/architecture.md)
-   [Stock Tracker テスト方針](../docs/services/stock-tracker/testing.md)
-   [コーディング規約](../docs/development/rules.md)
-   [テスト戦略](../docs/development/testing.md)

## 備考・未決定事項

-   自動更新のデフォルト値はオフ（FR3との整合）
-   インターバル値（10秒）はIssueで指定済みだが、ユーザー設定可能にするかは将来の検討事項
