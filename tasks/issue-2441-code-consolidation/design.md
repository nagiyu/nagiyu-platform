# コード共通化調査・対応 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/development/shared-libraries.md に ADR として抽出し、
    tasks/issue-2441-code-consolidation/ ディレクトリごと削除します。

    入力: tasks/issue-2441-code-consolidation/requirements.md
    次に作成するドキュメント: tasks/issue-2441-code-consolidation/tasks.md
-->

## 調査結果サマリー

### 重複実装の一覧

#### A. 完全重複（削除・統合が必要）

| ID | 類型 | 現在の実装場所 | 共通化先 | 優先度 |
|----|------|--------------|--------|--------|
| A-1 | Web Push 設定 | `stock-tracker/batch/src/lib/web-push-client.ts` の `getVapidConfig()` | `libs/common/src/push/` | 🔴 高 |
| A-1 | Web Push 設定 | `niconico-mylist-assistant/batch/src/lib/web-push-client.ts` の `getVapidConfig()` | `libs/common/src/push/` | 🔴 高 |
| A-2 | 権限チェック | `stock-tracker/core/src/services/auth.ts` の `checkPermission()` ラッパー | 削除（直接呼び出しに変更） | 🔴 高 |
| A-3 | User 型定義 | `auth/core/src/db/types.ts` の `User` インターフェース | `libs/common/src/auth/types.ts` から import | 🔴 高 |

#### B. 部分重複（パターン統一推奨）

| ID | 類型 | 現在の実装場所 | 統一方針 | 優先度 |
|----|------|--------------|--------|--------|
| B-1 | セッション取得 | `admin/web`, `auth/web`, `niconico-mylist-assistant/web`, `share-together/web` の各 `session.ts` | `libs/browser/src/` に統一 | 🟡 中 |
| B-2 | エラーメッセージ | 全サービスの `web` 層 | 現状維持（`COMMON_ERROR_MESSAGES` 継承パターン） | 🟡 中（新規サービスのみ適用） |

#### C. 正当な分散実装（対応不要）

| ID | 類型 | 実装場所 | 理由 |
|----|------|--------|------|
| C-1 | ビジネスエンティティ型 | 各サービス `core/src/types.ts` | サービス固有のビジネスロジック |
| C-2 | DynamoDB リポジトリ実装 | 各サービス `core/src/repositories/` | エンティティ固有のマッピングが必要 |
| C-3 | マッパー・バリデーター | 各サービス `core/src/` | ビジネスルール固有 |

---

## Phase 1 の設計（高優先度）

### A-1: `getVapidConfig()` の共通化

#### 現在の重複状況

```
services/stock-tracker/batch/src/lib/web-push-client.ts
  - getVapidConfig(): VapidConfig  ← 環境変数から VAPID 設定を返す

services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts
  - getVapidConfig(): VapidConfig  ← 同じ実装
```

#### 共通化方針

- `libs/common/src/push/` 配下はすでに存在するため、`getVapidConfig()` をそこに追加する
- 関数シグネチャ: `getVapidConfig(): VapidConfig`
- 環境変数: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`、subject は固定値 `'mailto:support@nagiyu.com'`

#### 依存関係の検証

- `VapidConfig` 型は既に `libs/common/src/push/` で定義済み
- Node.js の `process.env` を使用するため、クライアントサイドでは使用不可
- `libs/common` への追加は許可されている（Node.js バッチ処理からの使用）

#### 移行後の各サービスの変更

```
services/stock-tracker/batch/src/lib/web-push-client.ts
  - getVapidConfig() を削除
  - import { getVapidConfig } from '@nagiyu/common/push' に変更

services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts
  - 同様の変更
```

---

### A-2: `checkPermission()` ラッパーの削除

#### 現在の実装

```
services/stock-tracker/core/src/services/auth.ts
  - checkPermission(session, permission): boolean
    → hasPermission(session.user.roles, permission) を呼び出すだけ
```

#### 変更方針

- `services/stock-tracker/core/src/services/auth.ts` の `checkPermission()` を削除
- 呼び出し箇所を `libs/common` の `hasPermission()` の直接呼び出しに変更
- `auth.ts` が空になる場合はファイル自体を削除する

#### 影響範囲の確認

- `checkPermission()` の呼び出し箇所を `grep` で特定してからファイルを修正

---

### A-3: User 型定義の統一

#### 現在の重複

```
libs/common/src/auth/types.ts
  - User: { userId, googleId, email, name, roles, createdAt, updatedAt, lastLoginAt? }

services/auth/core/src/db/types.ts
  - User: { userId, googleId, email, name, picture?, roles, createdAt, updatedAt, lastLoginAt? }
    ← picture フィールドが追加されている
```

#### `picture` フィールドの使用状況調査

`services/auth/core` 内で `picture` フィールドが以下の箇所で実際に使用されている：

- `services/auth/core/src/auth/auth.ts`: Google OAuth の `user.image` を `picture` にマッピング
- `services/auth/core/src/db/repositories/dynamodb-user-repository.ts`: DynamoDB への保存・取得
- `services/auth/core/src/repositories/in-memory-user-repository.ts`: インメモリ実装
- `services/auth/core/src/repositories/user-repository.ts`: リポジトリインターフェース定義

`picture` フィールドは `auth` サービスでのみ使用されており、他のサービスでは使用されていない。

#### 変更方針

- `libs/common` の `User` 型に `picture?: string` フィールドを追加して拡張
- `services/auth/core/src/db/types.ts` の独自 `User` 定義を削除
- `auth/core` 全体で `import type { User } from '@nagiyu/common'` を使用

#### 注意事項

- `picture` フィールドの追加は `libs/common` の後方互換性を損なわない（optional フィールドのため）
- `picture` を使用していない他のサービスの型チェックも引き続き通ることを確認

---

## Phase 2 の設計（中優先度）

### B-1: セッション取得関数の共通化

#### 現在の重複状況

4 つのサービス（admin/web, auth/web, niconico-mylist-assistant/web, share-together/web）に
それぞれ `session.ts` が存在し、`getSession()` 関数が重複実装されている可能性がある。

#### 事前調査が必要な項目

実装前に以下を確認する：

1. 各 `session.ts` の実装内容が実際に一致しているかを確認
2. NextAuth.js のバージョンや設定が各サービスで同一かを確認
3. `libs/browser` が NextAuth.js に依存することが問題ないかを確認

#### 共通化方針（調査後に確定）

- 共通実装が確認された場合: `libs/browser/src/auth/session.ts` に統合
- サービス固有の差分がある場合: 共通部分のみを抽出し、差分は各サービスで上書き

---

## コンポーネント設計

### パッケージ責務分担（変更後）

| パッケージ | 責務 | 変更内容 |
|----------|------|--------|
| `libs/common` | 全環境共通ロジック（型、定数、純粋関数） | `push/config.ts` に `getVapidConfig()` 追加、`User` 型に `picture` 追加 |
| `libs/browser` | ブラウザ環境専用（LocalStorage, Clipboard, セッション） | Phase 2 でセッション取得関数を追加 |
| `libs/aws` | AWS SDK ラッパー | 変更なし |
| `services/stock-tracker/core` | stock-tracker ビジネスロジック | `auth.ts` の `checkPermission()` 削除 |
| `services/auth/core` | auth ビジネスロジック | `db/types.ts` の `User` 独自定義削除 |
| `services/stock-tracker/batch` | stock-tracker バッチ | `getVapidConfig()` の import 変更 |
| `services/niconico-mylist-assistant/batch` | niconico バッチ | `getVapidConfig()` の import 変更 |

### 実装モジュール一覧

**libs/common の追加・変更**

| モジュール | パス | 変更内容 |
|----------|------|--------|
| push/config | `libs/common/src/push/config.ts` | `getVapidConfig()` 関数を追加（新規ファイル） |
| auth/types | `libs/common/src/auth/types.ts` | `User` 型に `picture?: string` フィールドを追加 |

**libs/browser の追加（Phase 2）**

| モジュール | パス | 変更内容 |
|----------|------|--------|
| auth/session | `libs/browser/src/auth/session.ts` | `getSession()` 関数を追加（新規ファイル） |

**各サービスの削除・変更（Phase 1）**

| モジュール | パス | 変更内容 |
|----------|------|--------|
| web-push-client | `services/stock-tracker/batch/src/lib/web-push-client.ts` | `getVapidConfig()` を削除し import 変更 |
| web-push-client | `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts` | 同上 |
| auth | `services/stock-tracker/core/src/services/auth.ts` | `checkPermission()` を削除 |
| db/types | `services/auth/core/src/db/types.ts` | `User` 独自定義を削除し import 変更 |

---

## 実装上の注意点

### 依存関係・前提条件

- Phase 1 の変更は独立して実施可能（サービス間の依存なし）
- `libs/common` の変更は各サービスの変更より先に実施する
- Phase 2 は Phase 1 完了後に着手する

### セキュリティ考慮事項

- `getVapidConfig()` で使用する環境変数（`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`）は
  クライアントサイドに漏洩しないよう、バッチ・サーバーサイドでのみ使用すること
- `User` 型の `picture` フィールドは外部 URL（Google アカウント画像）のため、
  UI で表示する際は XSS 対策（`dangerouslySetInnerHTML` 禁止）を遵守すること

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/shared-libraries.md` に統合すること：
      - `libs/common/src/push/config.ts` の `getVapidConfig()` API ドキュメントを追記
      - `libs/common/src/auth/types.ts` の `User` 型の `picture` フィールド追加を記録
- [ ] `docs/development/rules.md` に追記すること（必要であれば）：
      - セッション取得関数は `libs/browser` を使用するルールを追記（Phase 2 完了後）
- [ ] `docs/development/architecture.md` に ADR として追記すること（重要な設計決定があれば）：
      - Web Push の VAPID 設定は `libs/common/src/push/` で一元管理する方針
