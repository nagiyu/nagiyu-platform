# Niconico Mylist Assistant - ステータス画面クライアントエラー修正

## 概要

Niconico Mylist Assistant にて、自動登録のステータス画面（`/mylist/status/[jobId]`）に遷移すると
クライアントサイドの例外が発生し、画面が表示されない。

## 関連情報

-   Issue: #1980
-   タスクタイプ: サービスタスク（niconico-mylist-assistant）

## 症状

-   画面表示: `Application error: a client-side exception has occurred while loading dev-niconico-mylist-assistant.nagiyu.com`
-   DevTools エラー: `Uncaught Error: 環境変数 DYNAMODB_TABLE_NAME が設定されていません`

## 調査結果

### 根本原因

`services/niconico-mylist-assistant/core/src/db/client.ts` にて、`getTableName()` がモジュールのロード時（モジュールスコープ）で即時実行されている。

```
// 問題のコード（概念）
export const TABLE_NAME = getTableName();  // モジュールロード時に実行される！
```

### 問題の伝播経路

1.  クライアントコンポーネント `JobStatusDisplay.tsx` が `@nagiyu/niconico-mylist-assistant-core` から `TWO_FACTOR_AUTH_CODE_REGEX` をインポート
2.  `core/src/index.ts` がバレルエクスポートで `db/index.js` を再エクスポート
3.  `db/index.js` が `db/client.ts` を再エクスポート
4.  `db/client.ts` の `TABLE_NAME = getTableName()` がモジュールスコープで実行
5.  Next.js がクライアントコンポーネントのバンドル時に `db/client.ts` を含める
6.  ブラウザでの実行時、`process.env.DYNAMODB_TABLE_NAME` は未設定（サーバー専用環境変数）のためエラーがスロー

### 影響ファイル

-   `services/niconico-mylist-assistant/core/src/db/client.ts` — 根本原因（モジュールスコープでの `getTableName()` 呼び出し）
-   `services/niconico-mylist-assistant/core/src/db/index.ts` — バレルエクスポートで `client.ts` を公開
-   `services/niconico-mylist-assistant/core/src/index.ts` — `db/index.js` を再エクスポート
-   `services/niconico-mylist-assistant/web/src/components/JobStatusDisplay.tsx` — クライアントコンポーネントからコアパッケージをインポート

## 要件

### 機能要件

-   FR1: ステータス画面（`/mylist/status/[jobId]`）を正常に表示できること
-   FR2: ジョブステータスのポーリングが正常に動作すること
-   FR3: 既存の DynamoDB アクセス（サーバー側）が引き続き正常に動作すること

### 非機能要件

-   NFR1: クライアントバンドルにサーバー専用コード（DynamoDB 接続情報等）が含まれないこと
-   NFR2: `@nagiyu/niconico-mylist-assistant-core` の後方互換性を維持すること
-   NFR3: ユニットテストカバレッジ 80% 以上を維持すること

## 実装方針

### 方針 A（推奨）: `db/client.ts` の遅延評価

`getTableName()` の呼び出しをモジュールスコープから関数スコープに移動する。

-   `TABLE_NAME` 定数を削除し、`getTableName()` 呼び出しを `getBatchJobRepository()` 等の関数内で行う
-   `db/batch-jobs.ts`、`db/videos.ts` 内での `TABLE_NAME` 参照をすべて `getTableName()` の呼び出しに置き換える
-   または、`db/client.ts` から `TABLE_NAME` のエクスポートを廃止し、各 `db/*.ts` ファイルが直接 `getTableName()` を呼ぶ

### 方針 B: `server-only` パッケージの導入

`db/client.ts` に `import 'server-only'` を追加し、Next.js がクライアントバンドルに含めないよう強制する。

-   この方式では、クライアントコンポーネントが `db/client.ts` をインポートしようとするとビルドエラーになる
-   バレルエクスポートから `db/index.js` を除外するか、クライアント向け/サーバー向けのエントリポイントを分離する必要がある

### 方針 C: コアパッケージのエントリポイント分割

`package.json` の `exports` フィールドで `./client` と `./server` のエントリポイントを分割し、クライアントコンポーネントはクライアント向けエントリポイントのみをインポートするよう変更する。

### 推奨アプローチ

**方針 A を優先的に検討する**。変更範囲が最小で、後方互換性も維持しやすい。
ただし、長期的にはバレルエクスポートの整理（方針 B または C の要素を組み合わせる）も検討する価値がある。

## タスク

-   [ ] T001: `db/client.ts` を調査し、`TABLE_NAME` 定数の利用箇所を洗い出す
-   [ ] T002: `db/batch-jobs.ts`、`db/videos.ts` の `TABLE_NAME` 参照を確認する
-   [ ] T003: 遅延評価（方針 A）または `server-only`（方針 B）の実装方針を確定する
-   [ ] T004: 選択した方針で `db/client.ts` を修正する
-   [ ] T005: 修正に伴うユニットテストの更新・追加
-   [ ] T006: `npm run lint --workspace=@nagiyu/niconico-mylist-assistant-core` の通過を確認
-   [ ] T007: `npm run test --workspace=@nagiyu/niconico-mylist-assistant-core` の通過を確認
-   [ ] T008: E2E テストの通過を確認（`npm run test:e2e --workspace=@nagiyu/niconico-mylist-assistant-web`）

## 参考ドキュメント

-   [コーディング規約](../docs/development/rules.md)
-   [アーキテクチャ方針](../docs/development/architecture.md)
-   [共通ライブラリ](../docs/development/shared-libraries.md)

## 備考・未決定事項

-   修正前後で dev 環境（`dev-niconico-mylist-assistant.nagiyu.com`）にデプロイして動作確認を行うことが望ましい
-   他サービス（stock-tracker、share-together 等）で同様のパターンが存在しないか確認すること
-   `libs/aws` の `getTableName()` は正しく実装されているため、修正不要
