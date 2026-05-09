<!--
    このドキュメントは開発時のみ使用します。
    Issue #2782（コード共通化調査）に対する候補洗い出し成果物。
    Phase B / C の完了後、永続化が必要な内容は docs/ に反映し、本ディレクトリは削除します。
-->

# コード共通化候補一覧（Issue #2782）

## 1. 概要

### 1.1 目的

services × 9（admin, auth, codec-converter, niconico-mylist-assistant, portal, quick-clip, share-together, stock-tracker, tools）と libs × 6（common, browser, ui, react, nextjs, aws）を横断調査し、重複ロジック・型定義・独自再実装を抽出。`libs/` への切り出し可否と依存関係ルール遵守を判断したうえで、共通化候補を列挙する。

### 1.2 スコープ

- 対象: services 全 9 個、libs 全 6 個
- 観点: 重複ロジック、型定義の重複、libs 既存機能の独自実装、依存方向ルール違反
- 非対象: infra/、docs/、tests/ 配下のテスト固有実装

### 1.3 依存関係ルール（再掲）

```
services/*/web   → libs/ui, libs/browser, libs/common
services/*/core  → libs/common のみ
services/*/batch → libs/common のみ

libs 間: ui → browser → common（一方向、循環禁止）
        react → common
        nextjs → common
        aws (モノレポ内 libs に依存しない)
```

### 1.4 調査方法

3 つの Explore サブエージェントを並列実行し、以下の分担で候補抽出。

- グループ A: services/admin, auth, codec-converter, niconico-mylist-assistant
- グループ B: services/portal, quick-clip, share-together, stock-tracker, tools
- 横断: libs 内重複 + 3 サービス以上に点在する候補

各エージェントの報告を本ドキュメントで統合・重複排除・再スコアリングしている。

---

## 2. 共通化候補一覧（統合後 22 件）

各候補は影響範囲（修正ファイル数感）／工数（S/M/L）／リスク／期待効果でスコアリング。

### A. COMMON_ERROR_MESSAGES の拡張と全サービス エラーメッセージ集約

- **該当ファイル**:
  - `libs/common/src/constants/error-messages.ts`（既存基盤）
  - `services/admin/core/src/errors/*.ts`、`services/admin/batch/src/stream-handler.ts`
  - `services/auth/core/src/db/repositories/dynamodb-user-repository.ts`
  - `services/codec-converter/web/src/lib/constants/errors.ts`
  - `services/niconico-mylist-assistant/web/src/lib/constants/errors.ts`、`batch/src/constants.ts`
  - `services/share-together/web/src/lib/constants/errors.ts`
  - `services/stock-tracker/web/components/AlertSettingsModal.tsx`（インライン定義）
  - `services/tools/src/lib/{timestamp,hash,base64}.ts` 各所
- **概要**: 各サービス・各層で ERROR_MESSAGES オブジェクトを独自定義。同一文言（DynamoDB params 必須、無効な入力 等）が複数箇所に重複。niconico は COMMON_ERROR_MESSAGES のスプレッド展開で部分共有しているが、パターン未統一。
- **共通化案**: `libs/common/src/constants/error-messages.ts` を拡張し、共通メッセージを集約 + サービス固有メッセージのレジストリ機構（名前空間 + extend パターン）を提供。`extractErrorMessage()` ヘルパーも `libs/common` に昇格。
- **影響**: 大（10+ ファイル） / **工数**: M / **リスク**: 小（参照置換のみ） / **効果**: 大（一貫性・i18n 準備・LOC -200 行超）

### B. Confirmation/Alert Dialog コンポーネントの libs/ui 統合

- **該当ファイル**:
  - `services/share-together/web/src/components/ConfirmDialog.tsx`
  - `services/stock-tracker/web/components/AlertDeleteConfirmDialog.tsx`、`NotificationOverwriteConfirmDialog.tsx`
- **概要**: 各サービスで「タイトル + メッセージ + 確認/キャンセルボタン」の確認ダイアログが個別実装。MUI Dialog のラップ方法が同形。
- **共通化案**: `libs/ui` に `<ConfirmDialog>` / `<AlertDialog>` を追加。`title`, `message`, `confirmLabel`, `onConfirm`, `severity` を Props で受ける。
- **影響**: 中（3〜5 ファイル） / **工数**: M / **リスク**: 小 / **効果**: 中（UI 一貫性、新規ダイアログ実装コスト削減）

### C. Snackbar/Toast Provider の libs/ui 昇格

- **該当ファイル**: `services/stock-tracker/web/components/SnackbarProvider.tsx`
- **概要**: MUI Snackbar + Alert を Context Provider として包んだ通知機構。stock-tracker 限定で実装されているが、quick-clip / share-together でも同等の通知 UI が必要。
- **共通化案**: `libs/ui` に `<SnackbarProvider>` と `useSnackbar()` を追加。複数トースト重複表示制御（Queue）も内包。
- **影響**: 中（2〜4 サービス） / **工数**: M / **リスク**: 小 / **効果**: 中（トースト管理統一）

### D. ErrorDisplay コンポーネントの libs/ui 化

- **該当ファイル**: `services/stock-tracker/web/components/ErrorDisplay.tsx`
- **概要**: API エラーを MUI Alert で表示し、リトライボタンを伴うコンポーネント。`@nagiyu/common` の `APIError` 型を扱う。他サービスは inline の Alert で代用。
- **共通化案**: `libs/ui` に `<ErrorDisplay>` を追加。`error: APIError`, `onRetry?: () => void` を Props に。
- **影響**: 小（新規追加） / **工数**: S / **リスク**: なし / **効果**: 中（エラー UI の統一）

### E. 数値・日付フォーマッタを libs/common へ集約

- **該当ファイル**:
  - `services/tools/src/lib/timestamp.ts`
  - `services/stock-tracker/web/lib/percentage-helper.ts`（formatPrice）
  - `services/stock-tracker/batch/src/lib/web-push-client.ts`（toFixed inline）
- **概要**: 数値・日付・パーセンテージのフォーマット処理がサービス間に点在。tools の `STOCK_TRACKER_TIMEZONE_OPTIONS` のように、所属が不適切なケースもある。
- **共通化案**: `libs/common/src/format/` に `formatNumber`, `formatCurrency`, `formatPercent`, `formatTimestamp` を集約。ロケール設定はオプション。
- **影響**: 小（3〜5 ファイル） / **工数**: S / **リスク**: 小（小数桁の仕様差異） / **効果**: 小〜中（書式一貫性）

### F. base64 / URL ユーティリティの集約

- **該当ファイル**:
  - `services/tools/src/lib/base64.ts`、`url-encoder.ts`
  - `libs/browser/src/push.ts`（urlBase64ToUint8Array）
  - `libs/nextjs/src/pagination.ts`（Buffer.from base64）
- **概要**: base64 変換が browser API・Buffer・自前実装の 3 系統で散在。URL エンコードは tools にしかなく、stock-tracker batch では `encodeURIComponent` が直書き。
- **共通化案**: `libs/common/src/url/`（URL）、`libs/browser/src/encoding/`（base64 / Uint8Array）に集約。tools は libs を参照。
- **影響**: 小（3〜5 ファイル） / **工数**: S / **リスク**: 小（edge case） / **効果**: 小（重複排除、edge case 一元修正）

### G. localStorage 名前空間マネージャを libs/browser へ

- **該当ファイル**: `services/share-together/web/src/lib/lastVisitedPath.ts`
- **概要**: localStorage を扱うラッパー。サービスごとにキープレフィックスを切る需要が複数サービスにある。
- **共通化案**: `libs/browser` に `createNamespacedStorage(prefix)` を追加。`get/set/remove` を提供。SSR 安全（typeof window チェック）。
- **影響**: 小（新規追加） / **工数**: S / **リスク**: なし / **効果**: 小（SPA UX の戻り先復帰機能等を再利用しやすく）

### H. Repository Factory レジストリ拡張（libs/aws）

- **該当ファイル**:
  - `libs/aws/src/dynamodb/repository-factory.ts`（既存基盤）
  - `services/admin/core/src/errors/factory.ts`
  - `services/niconico-mylist-assistant/core/src/repositories/factory.ts`
  - `services/share-together/core/src/repositories/factory.ts`
  - `services/stock-tracker/web/lib/repository-factory.ts`
  - `services/auth/core/src/db/repositories/dynamodb-user-repository.ts`（Factory 未使用）
- **概要**: `createRepositoryFactory()` が `libs/aws` にあるが、サービス側で repository 種別ごとに同パターンの Factory を独自実装。`requireDynamoParams` などのヘルパも各所に重複。auth は Factory パターン未適用。
- **共通化案**: `libs/aws` に複数 repository を一括 register する registry 機構を追加。サービスは `registerRepositories({ alerts, holdings, ... })` 形式で記述。auth サービスにも導入。
- **影響**: 中（4〜6 サービス） / **工数**: M / **リスク**: 小（既存 Factory との互換維持） / **効果**: 中（boilerplate 削減、auth の DRY 化）

### I. Web Push ペイロード Builder と Subscription 管理

- **該当ファイル**:
  - `services/admin/core/src/notify/web-push-sender.ts`
  - `services/admin/batch/src/stream-handler.ts`（buildPushPayload）
  - `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts`
  - `services/stock-tracker/batch/src/lib/web-push-client.ts`
  - `libs/common/src/push/`（NotificationPayload 型）
- **概要**: 送信処理は `@nagiyu/common/push` で統一済みだが、ペイロード組立（icon/url/data）とサービス毎のテンプレートがサービス側に分散。Subscription Repository も admin にしかない。
- **共通化案**: `libs/common/src/push/builders/` に `createNotificationPayload({ severity, service, eventType, ... })` を追加。Subscription Repository インタフェースを `libs/common` へ昇格。
- **影響**: 中（3 サービス） / **工数**: M / **リスク**: 中（Subscription データモデル変更） / **効果**: 中（Push 拡張時の再発明防止）

### J. ThemeRegistry / ServiceLayout 統合

- **該当ファイル**:
  - `services/portal/web/src/components/ThemeRegistry.tsx`
  - `services/tools/src/components/ThemeRegistry.tsx`
  - `services/stock-tracker/web/components/ThemeRegistry.tsx`
  - `services/share-together/web/src/app/layout.tsx`
  - `libs/ui/src/components/ServiceLayout`（既存）
- **概要**: AppRouterCacheProvider + ThemeProvider + CssBaseline の定型を各サービスが個別実装。ServiceLayout / ErrorBoundary / SnackbarProvider と組み合わせる構成も差がある。
- **共通化案**: `libs/ui` の ServiceLayout に Theme 初期化を組み込み、`<AppLayout>` として一本化。Session/ErrorBoundary/Snackbar はオプション props で制御。
- **影響**: 中（4 サービス） / **工数**: M / **リスク**: 中（既存 Provider 構成への影響） / **効果**: 中（layout 構成統一）

### K. DynamoDB AbstractRepository テンプレート強化

- **該当ファイル**:
  - `libs/aws/src/dynamodb/abstract-repository.ts`（既存）
  - `services/niconico-mylist-assistant/core/src/repositories/dynamodb-*.repository.ts`
  - `services/stock-tracker/core/src/repositories/dynamodb-*.repository.ts`
- **概要**: PK/SK 構築、GSI クエリ、Item ⇄ Entity マッピングが各リポジトリで重複（サービスあたり 200〜600 行）。AbstractRepository があるが、Item ⇄ Entity 変換テンプレートが未提供。
- **共通化案**: `libs/aws` に `createMapper<TItem, TEntity>()` を追加し、AbstractRepository の `mapToItem`/`mapToEntity` を generic 化。
- **影響**: 大（6+ リポジトリ、~1500 行） / **工数**: L / **リスク**: 中（テスト破綻） / **効果**: 大（200+ 行削減・パターン統一）

### L. API レスポンス Builder / Pagination 利用徹底（libs/nextjs）

- **該当ファイル**:
  - `libs/nextjs/src/pagination.ts`、`error.ts`、`session.ts`
  - 全 services の `web/src/app/api/**/route.ts`（10+ 箇所）
- **概要**: `libs/nextjs` に pagination・error helper があるが、利用が任意で API ルートごとに try-catch / response 整形が独自に書かれている。Zod バリデーション失敗時のレスポンスも非統一。
- **共通化案**: `libs/nextjs` に `createApiHandler({ schema, handler, requireAuth })` を導入し、エラー整形・pagination・auth check を一元化。lint ルール or テストで利用を強制。
- **影響**: 大（全 API route） / **工数**: M（フレーム提供） / **リスク**: 中（既存 API レスポンス互換） / **効果**: 大（300+ 行削減・API 一貫性）

### M. useFormState フックを libs/react へ

- **該当ファイル**:
  - `services/stock-tracker/web/components/AlertSettingsModal.tsx`（14 個の useState）
  - `services/share-together/web/src/components/TodoForm.tsx`
  - `services/stock-tracker/web/app/holdings/page.tsx`
- **概要**: 複数フィールドのフォーム状態管理が `useState` 連発 + setErrors の手書きで構成。submit handler のローディング・バリデーションも各所に重複。
- **共通化案**: `libs/react` に `useFormState<T>({ initial, validate, onSubmit })` を追加。submit メモ化と error/loading state を内包。
- **影響**: 大（10+ ファイル） / **工数**: L / **リスク**: 中（既存フォームの書き換え） / **効果**: 大（フォームコード -50%）

### N. Crypto Utility 抽出

- **該当ファイル**: `services/niconico-mylist-assistant/core/src/utils/crypto.ts`（245 行、AES-256-GCM）
- **概要**: パスワード暗号化・Secrets Manager キャッシュが niconico-mylist-assistant に閉じている。他サービスで暗号化が必要になった際に再発明されるリスク。
- **共通化案**: `libs/aws` または `libs/common` に `CryptoService` を切り出し。Secrets Manager 連携も統一。
- **影響**: 小（1 サービス） / **工数**: M / **リスク**: 中（既存連携テスト） / **効果**: 小〜中（再発明防止）

### O. Middleware 認証プリセット（libs/nextjs）

- **該当ファイル**:
  - `services/admin/web/src/middleware.ts`
  - `services/auth/web/src/middleware.ts`
  - `services/niconico-mylist-assistant/web/src/middleware.ts`
- **概要**: `createAuthMiddleware` は libs/nextjs にあるが、publicPaths / SKIP_AUTH_CHECK / Runtime 指定が各サービスで微妙に異なる。
- **共通化案**: `libs/nextjs` に preset（"public-home", "fully-private" 等）を追加。
- **影響**: 小（3 ファイル） / **工数**: S / **リスク**: 小（環境変数命名統一が必要） / **効果**: 小（middleware 設定統一）

### P. OpenAI クライアント Factory 集約

- **該当ファイル**:
  - `services/stock-tracker/batch/src/lib/openai-client.ts`（withTimeout, retry）
  - `services/quick-clip/core/src/libs/openai-client.ts`（minimal）
- **概要**: stock-tracker は timeout/retry/Zod parse まで wrap、quick-clip は最小構成。今後 AI 連携が増えた際に再発明される恐れ。
- **共通化案**: `libs/common` に `createOpenAIClient({ timeout, retry, ... })` を追加。Zod schema parse helper も同梱。
- **影響**: 小（2〜3 ファイル） / **工数**: M / **リスク**: 小（モデル名統一） / **効果**: 小〜中（AI 連携保守性）

### Q. File Validation を libs/common へ

- **該当ファイル**: `services/codec-converter/core/src/validation.ts`（99 行、validateFile / Size / MimeType / Extension）
- **概要**: ファイルアップロード検証ロジックが codec-converter に閉じている。stock-tracker の summary 添付や quick-clip など、ファイル系で再利用余地あり。
- **共通化案**: `libs/common` に `FileValidator` を抽出。ルール（max size, allowed mimes, allowed exts）を Props で。
- **影響**: 小（1 サービス） / **工数**: S / **リスク**: なし / **効果**: 小（将来 file 系サービスで再利用）

### R. Logger Service-level Adoption

- **該当ファイル**: `libs/common/src/logger/`（推定）+ 全 batch/core サービス
- **概要**: 各 batch サービスで console.log 直書きが残っている可能性。observability 不足。
- **共通化案**: logger 利用の SDK 化 + サービス共通の bootstrap。
- **影響**: 大（全 batch / core） / **工数**: M〜L / **リスク**: 中（performance impact） / **効果**: 大（observability）

### S. Validation Error Handling 標準化

- **該当ファイル**:
  - `libs/common/src/validation/`
  - `services/stock-tracker/core/src/validation/index.ts`
  - `services/share-together/core/src/libs/group.ts`
  - `services/codec-converter/core/src/validation.ts`
- **概要**: ValidationResult パターン / 例外パターン / 独自エラーパターンが混在。HTTP status マッピングも非統一。
- **共通化案**: `libs/common` に `ValidationError` クラス + `createValidator()` Factory。Zod schema の DSL 化。
- **影響**: 大 / **工数**: L / **リスク**: 大（breaking change） / **効果**: 大（型安全・一貫性）

### T. Test Utilities / Fixtures（libs/common-test 等）

- **該当ファイル**: 各サービスの `tests/`、`jest.setup.ts`
- **概要**: TEST_USER_ID 等のデフォルト値・Mock DynamoDB クライアント・Mock WebPush が各サービスで重複実装。
- **共通化案**: 新規 `libs/test-utils`（または libs/common 配下）に test fixtures を集約。
- **影響**: 小（テストのみ） / **工数**: S / **リスク**: なし / **効果**: 小（テスト保守性）

### U. 共通型定義（User, BatchJob, NotificationPayload 等）

- **該当ファイル**:
  - `services/auth/core/src/{repositories,db}/*` の User 型
  - `services/niconico-mylist-assistant/core/src/types/index.ts`（BatchStatus, BatchResult）
  - 各サービスの Dialog Props 型
- **概要**: User / BatchJob などサービス横断の概念がサービス内に閉じて定義され、サービス間 API 連携時に型互換が取りづらい。
- **共通化案**: `libs/common/src/types/` に共通基本型を定義。サービス固有拡張は intersection で。
- **影響**: 中（4+ 箇所） / **工数**: M / **リスク**: 中（型互換 migration） / **効果**: 中（型安全・サービス間連携）

### V. Batch Job ステータス管理

- **該当ファイル**:
  - `services/niconico-mylist-assistant/batch/src/index.ts`（updateBatchJob 多数呼び出し）
  - `services/admin/batch/src/stream-handler.ts`
- **概要**: バッチジョブのステータス遷移（RUNNING → SUCCEEDED/FAILED 等）が手書き。ステートマシン化されておらず、リトライ・ログも非統一。
- **共通化案**: `libs/common` または `libs/aws` に `BatchJobStatusManager` を追加。
- **影響**: 中（2 batch） / **工数**: M / **リスク**: 中（既存 job 状態 migration） / **効果**: 中（堅牢性）

---

## 3. スコアリングサマリ

| ID | 候補 | 影響 | 工数 | リスク | 効果 | 軽さ |
|----|------|------|------|------|------|------|
| A | エラーメッセージ集約 | 大 | M | 小 | 大 | 中 |
| B | Confirmation Dialog | 中 | M | 小 | 中 | 中 |
| C | Snackbar Provider | 中 | M | 小 | 中 | 中 |
| D | ErrorDisplay | 小 | S | なし | 中 | 軽 |
| E | 数値・日付フォーマッタ | 小 | S | 小 | 中 | 軽 |
| F | base64 / URL utility | 小 | S | 小 | 小 | 軽 |
| G | localStorage マネージャ | 小 | S | なし | 小 | 軽 |
| H | Repository Factory レジストリ | 中 | M | 小 | 中 | 中 |
| I | Web Push ペイロード Builder | 中 | M | 中 | 中 | 中 |
| J | ThemeRegistry / ServiceLayout | 中 | M | 中 | 中 | 中 |
| K | DynamoDB AbstractRepository 強化 | 大 | L | 中 | 大 | 重 |
| L | API レスポンス Builder（nextjs） | 大 | M | 中 | 大 | 重 |
| M | useFormState フック | 大 | L | 中 | 大 | 重 |
| N | Crypto Utility 抽出 | 小 | M | 中 | 小 | 中 |
| O | Middleware 認証プリセット | 小 | S | 小 | 小 | 軽 |
| P | OpenAI クライアント Factory | 小 | M | 小 | 中 | 中 |
| Q | File Validation | 小 | S | なし | 小 | 軽 |
| R | Logger Adoption | 大 | M〜L | 中 | 大 | 重 |
| S | Validation Error 標準化 | 大 | L | 大 | 大 | 重 |
| T | Test Utilities | 小 | S | なし | 小 | 軽 |
| U | 共通型定義 | 中 | M | 中 | 中 | 中 |
| V | Batch Job ステータス管理 | 中 | M | 中 | 中 | 中 |

---

## 4. Top 5 推奨（軽い順 → 重い順）

軽い候補から integration ブランチに順次取り込む方針。dev 環境への影響を抑え、レビュー粒度も保ちやすい。

### Top 5（最軽）: G. localStorage 名前空間マネージャを libs/browser へ

- **狙い**: `libs/browser` に SSR 安全な `createNamespacedStorage(prefix)` を追加し、share-together の lastVisitedPath を置き換える。今後の SPA UX（戻り先復帰、設定永続化）の基盤。
- **想定差分**: 新規 1 ファイル（libs/browser）、既存置換 1〜2 ファイル
- **完了条件**: 新ユーティリティの単体テスト追加、既存サービス（share-together）が新 API に移行、テスト全グリーン

### Top 4: E. 数値・日付フォーマッタを libs/common へ

- **狙い**: `libs/common/src/format/` に formatNumber / formatCurrency / formatPercent / formatTimestamp を集約。tools / stock-tracker から抽出。
- **想定差分**: 新規 1〜2 ファイル、置換 3〜5 ファイル
- **完了条件**: ロケールオプションのテスト、stock-tracker の formatPrice / tools の timestamp が libs/common 経由に移行

### Top 3: D + C. ErrorDisplay と Snackbar Provider の libs/ui 昇格

- **狙い**: stock-tracker の `<ErrorDisplay>` と `<SnackbarProvider>` を `libs/ui` に昇格。`useSnackbar()` フックも export し、複数サービスで利用可能にする。
- **想定差分**: 新規 2〜3 ファイル、置換 2〜4 サービス
- **完了条件**: storybook（あれば）追加、stock-tracker が libs/ui 版に切替、その他サービス（quick-clip / share-together）でも opt-in 可能

### Top 2: H. Repository Factory レジストリ拡張（libs/aws）

- **狙い**: `libs/aws` の Factory 機構に複数 repository 一括 register API を追加。auth サービスにも適用し、4 サービスで統一。
- **想定差分**: libs/aws 1〜2 ファイル拡張、サービス 4 つの factory リファクタ
- **完了条件**: 各サービスの repository factory boilerplate 削減、テスト全グリーン、既存 InMemory 切替動作維持

### Top 1（最重）: A. COMMON_ERROR_MESSAGES 拡張と全サービスのエラーメッセージ集約

- **狙い**: `libs/common/src/constants/error-messages.ts` を拡張し、サービス固有メッセージのレジストリ機構を導入。`extractErrorMessage()` も `libs/common` に昇格。全サービスの ERROR_MESSAGES を整理。
- **想定差分**: libs/common 拡張、10+ サービスファイルのリファクタ
- **完了条件**: i18n 化準備として全メッセージを名前空間付きで集約、既存テスト維持

---

## 5. Top 5 に含めなかった候補について

以下の候補は重要だが、本 Issue（#2782）のスコープ外として **別 Issue で別途対応**する想定。

- **K, L, M, R, S**（重い候補）: いずれも工数 L または波及範囲が API 全面に及ぶ。1 つの integration ブランチに含めると dev 安定性が損なわれるリスク。完了後に別途 Issue 起票して取り組む。
- **B, F, I, J, N, O, P, Q, T, U, V**（中規模／個別最適）: 効果はあるが、今期の最優先 5 件には入れない。Top 5 完了後の継続候補として candidates ドキュメントに残し、整理は parent Issue #2782 で更新する。

---

## 6. 留意事項

- **依存ルール**: すべての候補で `ui → browser → common` / `core → common` を厳守する。共通化先の libs を間違えるとリファクタが大規模化するため、PR ごとに依存方向を確認する。
- **テスト**: `coverageThreshold` 80% を維持する。共通化対象が utility 系なら新規テスト追加が容易。UI 系（C, D）はビジュアルリグレッションに注意。
- **エラー文言**: CLAUDE.md「エラーメッセージは日本語 + 定数化」に従う。Top 1（A）はこれを徹底する位置づけ。
- **integration ブランチ運用**: Top 5 → Top 1 を順次マージ。各サブ Issue は **integration マージ + dev 反映確認** をもってクローズ（今回の特例運用）。
- **クリーンアップ**: 全 Top 完了後、本ディレクトリ（`tasks/2782-code-consolidation/`）を削除し、永続化必要な内容は `docs/development/shared-libraries.md` 等に反映する（Phase C）。

---

## 7. 次アクション

本ドキュメントのレビュー後、Phase B として **Top 5（G: localStorage マネージャ）** のサブ Issue を #2782 配下に起票し、`integration/2782-code-consolidation` 向けの作業ブランチを切る。
