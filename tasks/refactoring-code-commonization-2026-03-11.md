# コード共通化調査・実装方針

## 概要

プラットフォーム全体のサービス・ライブラリ間に存在する重複実装を特定し、共通ライブラリへの集約によるコード量削減・保守性向上を目的としたリファクタリングの方針を定める。

## 関連情報

-   Issue: [Refactoring] コード共通化調査 (2026-03-11)
-   タスクタイプ: プラットフォームタスク / リファクタリング
-   調査対象:
    -   `services/admin`, `services/auth`, `services/codec-converter`
    -   `services/niconico-mylist-assistant`, `services/share-together`
    -   `services/stock-tracker`, `services/tools`
    -   `libs/aws`, `libs/browser`, `libs/common`, `libs/nextjs`, `libs/react`, `libs/ui`

---

## 調査結果サマリー

調査の結果、約 **930 行** 相当のコードが複数サービスに分散して重複していることが判明した。
適切にライブラリへ集約することで、推定 **約 500 行（53%）** 削減が可能である。

重複の主要カテゴリは以下の 5 つ。

| カテゴリ | 重複ファイル数 | 概算行数 | 削減見込み | 優先度 |
| --- | --- | --- | --- | --- |
| 認証設定（auth.ts） | 5 | ~114 行 | ~67 行（59%） | 🔴 高 |
| ミドルウェア（middleware.ts） | 4 | ~194 行 | ~150 行（77%） | 🔴 高 |
| セッション取得ロジック | 5 | ~164 行 | ~130 行（79%） | 🔴 高 |
| エラーメッセージ定数 | 3 | ~150 行 | ~70 行（47%） | 🟡 中 |
| AWS クライアント初期化 | 1 | ~35 行 | ~20 行（57%） | 🟡 中 |
| ヘルスチェックルート | 1 | ~14 行 | ~10 行（71%） | 🟢 低 |
| **合計** | **19** | **~671 行** | **~447 行（67%）** | |

> **注記**: T000 事前確認により以下が判明し、当初推計から修正した。
> - `services/codec-converter/web/src/auth.ts` は存在しないため認証設定の対象外（6 → 5 ファイル）
> - `services/stock-tracker/batch/src/lib/aws-clients.ts` は既に `@nagiyu/aws` の薄いラッパーであり移行不要
> - ヘルスチェックルートは `services/share-together` の 1 サービスのみが手動実装（他 6 サービスは `createHealthRoute()` 使用済み）
> - 削減見込みはライブラリ本体の実装コスト（新規追加分）を差し引いた実質削減量の推定値

---

## 重複実装一覧（ファイルパス付き）

### 🔴 認証・セッション関連（即時ライブラリ化推奨）

#### 認証設定ファイル（auth.ts）

複数サービスで `createAuthConfig()` の呼び出しパターンが重複している。
オプション（`includeSubAsUserIdFallback` 等）の渡し方のみが異なる。

-   `services/admin/web/src/auth.ts`
-   `services/auth/web/src/app/api/auth/[...nextauth]/route.ts`
-   `services/niconico-mylist-assistant/web/src/auth.ts`
-   `services/share-together/web/auth.ts`
-   `services/stock-tracker/web/auth.ts`

> ⚠️ `services/codec-converter/web/src/auth.ts` は存在しないため対象外。

**共通パターン**: `providers: []`、`trustHost: true`、`signIn` ページの URL 設定が全サービスで同一。

#### ミドルウェア（middleware.ts）

「未認証ユーザーをサインインページへリダイレクトする」というコアロジックが各サービスで重複している。
`SKIP_AUTH_CHECK` フラグによる開発時スキップ処理も全サービスで同一。

-   `services/admin/web/src/middleware.ts`（~46 行）
-   `services/auth/web/src/middleware.ts`（~41 行）
-   `services/niconico-mylist-assistant/web/src/middleware.ts`（~57 行）
-   `services/share-together/web/src/middleware.ts`（~50 行）

**差異**: 認証不要パス（`/` 等）の除外設定がサービスごとに異なる。

#### セッション取得ロジック（session.ts / auth.ts）

「テスト環境ではモックセッションを返す、本番では `auth()` から取得する」というロジックが重複している。
テストユーザーのデフォルト値（`roles` フィールド等）のみがサービスごとに異なる。

-   `services/admin/web/src/lib/auth/session.ts`（~50 行）
-   `services/auth/web/src/lib/auth/session.ts`（~35 行）
-   `services/niconico-mylist-assistant/web/src/lib/auth/session.ts`（~42 行）
-   `services/share-together/web/src/lib/auth/session.ts`（~37 行）
-   `services/stock-tracker/web/lib/auth.ts`（~54 行）

---

### 🟡 定数・クライアント初期化関連（段階的なライブラリ化推奨）

#### エラーメッセージ定数

HTTP エラーに対応する日本語メッセージ定数（`UNAUTHORIZED`・`FORBIDDEN`・`NOT_FOUND`・`VALIDATION_ERROR`・`INTERNAL_SERVER_ERROR` 等）が各サービスで独自定義されている。
サービス固有のエラー文言が追加されているが、共通部分は完全に重複。

-   `services/stock-tracker/web/lib/error-messages.ts`（~48 行）
-   `services/share-together/web/src/lib/constants/errors.ts`（~28 行）
-   `services/niconico-mylist-assistant/web/src/lib/constants/errors.ts`（~46 行）

#### AWS クライアント初期化（aws-clients.ts）

DynamoDB・S3・Batch の各クライアントをシングルトンパターンで初期化するコードが重複している。
`libs/aws` に既に DynamoDB・S3 クライアントのファクトリが存在するが、一部のサービスで利用されていない。

-   `services/share-together/web/src/lib/aws-clients.ts`（S3・Batch クライアントが独自実装。DynamoDB は既に `@nagiyu/aws` 経由）

> ⚠️ T000 事前確認結果:
> - `services/codec-converter/web/src/lib/aws-clients.ts`: DynamoDB は `@nagiyu/aws` 経由済み。S3・Batch は独自実装のため T007（Batch ファクトリ追加）後に T008 で移行対象とする
> - `services/stock-tracker/batch/src/lib/aws-clients.ts`: `@nagiyu/aws` の薄いラッパーのみで独自ロジックなし → **移行不要・対象外**

---

### 🟢 その他・構成統一（既存パターン普及推奨）

#### ヘルスチェックルート

`libs/nextjs` に `createHealthRoute()` が既に実装されているが、`services/share-together` のみが手動実装している。

-   `services/share-together/web/src/app/api/health/route.ts`（手動実装 / `HealthResponse` 型を `@/types` から参照）

> ⚠️ T000 事前確認結果: 手動実装は上記 1 サービスのみ。
> `services/admin`, `services/auth`, `services/codec-converter`, `services/niconico-mylist-assistant`, `services/stock-tracker`, `services/tools` は全て `createHealthRoute()` を使用済み。

#### `next.config.ts` の `transpilePackages` 設定

各サービスの `next.config.ts` で指定する `transpilePackages` リストが統一されておらず、サービスによって `@nagiyu/nextjs` や `@nagiyu/react` が漏れているケースがある。

---

## 既存ライブラリの活用状況

### 適切に設計されている領域（変更不要）

-   **`libs/common` の API クライアント**: `api/client.ts` にリトライ・タイムアウト付き汎用 fetch ラッパーが実装済み
-   **`libs/react` の `useAPIRequest`**: React フックとして API リクエスト状態管理が実装済み
-   **`libs/react` の `ApiClient`**: クラスベースの API クライアントが `libs/common` をラップする形で適切に実装済み
-   **`libs/nextjs` の `createHealthRoute()`**: 既に実装済みだが普及が不十分

### 追加・拡充が必要な領域

-   **`libs/nextjs`**: `createAuthMiddleware()` ファクトリ関数が未実装
-   **`libs/nextjs`**: セッション取得のファクトリ関数が未実装
-   **`libs/common`**: 共通エラーメッセージ定数が未実装（`ERROR_CODES` は存在するが日本語メッセージは各サービスに分散）
    -   既存の `ERROR_CODES` はエラーコード文字列（`"UNAUTHORIZED"` 等）を定義しており、**日本語メッセージとは別物**
    -   新設する定数名は既存の `error-messages.ts` 実装パターン（`ERROR_MESSAGES` オブジェクト）に合わせ `COMMON_ERROR_MESSAGES` とする
    -   各サービスは `COMMON_ERROR_MESSAGES` をスプレッドしてサービス固有文言を追加する命名規則を統一する
-   **`libs/aws`**: Batch クライアントのファクトリが未実装（S3・DynamoDB は実装済み）

---

## 実装方針

### 依存関係ルールの遵守

ライブラリ化に際しては、依存関係の一方向性 `ui → browser → common` を厳守する。

-   **`libs/common`**: フレームワーク非依存。Node.js・ブラウザ・Edge Runtime すべてで動作すること
-   **`libs/nextjs`**: Next.js・NextAuth.js に依存可。`libs/common` に依存可
-   **`libs/react`**: React に依存可。`libs/common` に依存可
-   **`libs/aws`**: AWS SDK に依存可。`libs/common` に依存可

---

## タスク

### フェーズ 0: 事前確認（実装着手前に完了）

-   [x] T000: 「要確認」ファイルの実装内容を実際に確認し、本ドキュメントの内容を更新する
    -   `services/codec-converter/web/src/auth.ts`: **存在しない** → 認証設定ファイルの対象外
    -   `services/codec-converter/web/src/lib/aws-clients.ts`: **DynamoDB は `@nagiyu/aws` 経由済み**。S3・Batch は独自実装 → T007 後に T008 で移行対象
    -   `services/stock-tracker/batch/src/lib/aws-clients.ts`: **`@nagiyu/aws` の薄いラッパーのみ**（独自ロジックなし）→ 移行不要
    -   手動実装のヘルスチェックルートは `services/share-together` の 1 サービスのみ

### フェーズ 1: 認証・セッション関連の共通化（優先度：高）

-   [ ] T001: `libs/nextjs` に `createAuthMiddleware()` ファクトリ関数を実装する
    -   認証不要パスをオプションで受け取れるようにする
    -   `SKIP_AUTH_CHECK` フラグによる開発時スキップ処理を内包する
    -   対象ファイル: `libs/nextjs/src/middleware.ts`（新規）、`libs/nextjs/src/index.ts`
-   [ ] T002: 各サービスの `middleware.ts` を `createAuthMiddleware()` で置き換える
    -   対象: `services/admin/web/src/middleware.ts`
    -   対象: `services/auth/web/src/middleware.ts`
    -   対象: `services/niconico-mylist-assistant/web/src/middleware.ts`
    -   対象: `services/share-together/web/src/middleware.ts`
-   [ ] T003: `libs/nextjs` にセッション取得ファクトリ関数を実装する
    -   テスト環境用デフォルト値をオプションとして受け取れるようにする（DI）
    -   対象ファイル: `libs/nextjs/src/session.ts`（新規）、`libs/nextjs/src/index.ts`
-   [ ] T004: 各サービスのセッション取得ロジックをファクトリ関数で置き換える
    -   対象: `services/admin/web/src/lib/auth/session.ts`
    -   対象: `services/auth/web/src/lib/auth/session.ts`
    -   対象: `services/niconico-mylist-assistant/web/src/lib/auth/session.ts`
    -   対象: `services/share-together/web/src/lib/auth/session.ts`
    -   対象: `services/stock-tracker/web/lib/auth.ts`

### フェーズ 2: 定数・クライアントの共通化（優先度：中）

-   [ ] T005: `libs/common` に共通エラーメッセージ定数を追加する
    -   HTTP ステータスに対応する日本語メッセージを `COMMON_ERROR_MESSAGES` オブジェクトとして定数化する
    -   既存の `ERROR_CODES`（エラーコード文字列）とは別ファイルに定義し、対応関係をコメントで明示する
    -   型エイリアス（`CommonErrorMessageKey`）も合わせてエクスポートする
    -   対象ファイル: `libs/common/src/constants/error-messages.ts`（新規）、`libs/common/src/index.ts`
-   [ ] T006: 各サービスのエラーメッセージ定数を `COMMON_ERROR_MESSAGES` をスプレッドする形に変更する
    -   サービス固有のエラー文言は各サービスで保持し、共通部分のみ差し替える
    -   各サービス固有オブジェクト名は `ERROR_MESSAGES` に統一する（既存の命名規則に合わせる）
    -   対象: `services/stock-tracker/web/lib/error-messages.ts`
    -   対象: `services/share-together/web/src/lib/constants/errors.ts`
    -   対象: `services/niconico-mylist-assistant/web/src/lib/constants/errors.ts`
-   [ ] T007: `libs/aws` に Batch クライアントのファクトリを追加する
    -   S3・DynamoDB と同様のシングルトンパターンで実装する
    -   対象ファイル: `libs/aws/src/batch/index.ts`（新規）、`libs/aws/src/index.ts`
-   [ ] T008: `libs/aws` 未使用サービスを `libs/aws` 経由に移行する
    -   対象: `services/share-together/web/src/lib/aws-clients.ts`（S3 のみ。DynamoDB は移行済み）
    -   対象: `services/codec-converter/web/src/lib/aws-clients.ts`（S3・Batch。T007 完了後に着手。DynamoDB は移行済み）

### フェーズ 3: 構成統一・既存パターンの普及（優先度：低）

-   [ ] T009: 手動実装のヘルスチェックルートを `createHealthRoute()` に統一する
    -   対象: `services/share-together/web/src/app/api/health/route.ts`（唯一の手動実装サービス）
-   [ ] T010: 各サービスの `next.config.ts` の `transpilePackages` を標準化する
    -   全サービスで参照すべきパッケージリストをドキュメント化し、各サービスの設定を統一する
    -   対象: 全サービスの `next.config.ts`

---

## 参考ドキュメント

-   `docs/development/rules.md` - コーディング規約（依存関係ルール含む）
-   `docs/development/architecture.md` - アーキテクチャ方針
-   `libs/nextjs/src/index.ts` - `createHealthRoute()`・`createAuthConfig()` の既存エクスポート
-   `libs/common/src/index.ts` - `ERROR_CODES`・`HTTP_STATUS` の既存エクスポート
-   `libs/aws/src/index.ts` - S3・DynamoDB クライアントの既存実装

---

## 備考・未決定事項

-   `libs/nextjs` に追加するミドルウェアファクトリは Edge Runtime での動作確認が必要（NextAuth.js の制約上）
-   認証設定ファイル（auth.ts）の統一については、サービスごとの `includeSubAsUserIdFallback` 等オプションの差異が設計意図によるものか確認が必要
-   フェーズ 1・2 の変更後は既存のテストが通ることを確認し、カバレッジが 80% を下回らないようにする
