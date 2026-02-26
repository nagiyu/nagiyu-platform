# Stock Tracker Web E2E チャートテスト修正

## 概要

Stock Tracker の Web E2E テストにおいて、チャート描画を期待するテストケースがほぼ毎回同じ箇所で失敗していた。
原因は、架空の取引所・ティッカーを使用した状態でチャート描画を期待していたため。
TradingView API は架空のティッカーに対してデータを返さず、チャートが描画されない。

## 関連情報

-   Issue: #1369
-   タスクタイプ: サービスタスク（stock-tracker/web）
-   対象ファイル: `services/stock-tracker/web/tests/e2e/chart-display.spec.ts`

## 要件

### 機能要件

-   FR1: チャート描画を期待する E2E テストでは、実在する取引所・ティッカーを使用すること
-   FR2: 使用する取引所キーは TradingView API で有効なもの（例: `NSDQ`）であること
    -   `NSDQ` は TradingView API での NASDAQ の正式なキー（コードベース全体で使用: `types.ts`, `validation/index.ts`, `tradingview-client.ts` 参照）
-   FR3: 使用するティッカーシンボルは TradingView API で有効なもの（例: `NVDA`）であること

### 非機能要件

-   NFR1: テスト終了後にテストデータをクリーンアップすること（TestDataFactory の cleanup を使用）
-   NFR2: テストの信頼性が向上し、CI で安定して通過すること

## 実装のヒント

-   `TestDataFactory.createExchange({ key: 'NSDQ', name: 'NASDAQ Stock Market' })` で実在する取引所を作成
-   `TestDataFactory.createTicker({ symbol: 'NVDA', name: 'NVIDIA Corporation', exchangeId: ... })` で実在するティッカーを作成
-   `NSDQ:NVDA`（NVIDIA）は流動性が高く、TradingView API で常にデータが取得できる
-   架空のティッカーでは TradingView のタイムアウト（10秒）後にエラーが返されるが、
    タイミングによってはテストの Promise.race が適切に解決しない場合がある

## タスク

-   [x] T001: `chart-display.spec.ts` の `チャート表示機能` describe ブロックの `beforeEach` を修正
    -   架空のティッカー作成（`factory.createTicker()`）を実在する取引所・ティッカー作成に変更
    -   `factory.createExchange({ key: 'NSDQ', name: 'NASDAQ Stock Market' })`
    -   `factory.createTicker({ symbol: 'NVDA', name: 'NVIDIA Corporation', exchangeId: ... })`
-   [x] T002: 時間枠/表示本数変更後の待機処理を `waitForResponse` ベースに変更
    -   `networkidle` は React の非同期レンダリング→useEffect→fetch の前に解決してしまう
    -   ドロップダウンクリック前に `page.waitForResponse(r => r.url().includes('/api/chart/'))` をセットアップ
    -   レスポンス到着後にポーリングで DOM 反映を確認

## 参考ドキュメント

-   [コーディング規約](../docs/development/rules.md)
-   [テスト戦略](../docs/development/testing.md)
-   TradingView API キー仕様: `services/stock-tracker/core/src/types.ts`（Key フィールドのコメント参照）

## 備考・未決定事項

-   他のテスト（`top-page-selector.spec.ts` 等）は架空のティッカーを使用しているが、
    チャート描画を期待しないため修正不要
-   `NSDQ:NVDA` が将来的に廃止・上場廃止になった場合は、別の実在銘柄に変更が必要
