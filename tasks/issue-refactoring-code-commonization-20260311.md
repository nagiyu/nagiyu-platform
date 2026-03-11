# [Refactoring] コード共通化調査 (2026-03-11)

## 概要

本ドキュメントは、nagiyu-platform における重複実装・共通化候補を調査した結果をまとめたものである。
対象はサービス層（services/）と共通ライブラリ層（libs/）の全パッケージ。

## 関連情報

- タスクタイプ: プラットフォームタスク（全サービス横断）
- 調査対象:
    - services/admin, services/auth, services/codec-converter
    - services/niconico-mylist-assistant, services/stock-tracker, services/tools
    - libs/aws, libs/browser, libs/common, libs/nextjs, libs/react, libs/ui

---

## 依存関係ルール（再確認）

```
ui → browser → common（循環禁止）
nextjs → common
react → common
aws: モノレポ内ライブラリに依存しない（独立）
```

---

## 1. 重複実装の候補

### 1.1 NextAuth 設定（auth.ts）【最重要・完全重複】

**ファイル一覧**:

- `services/admin/web/src/auth.ts`
- `services/niconico-mylist-assistant/web/src/auth.ts`
- `services/stock-tracker/web/auth.ts`
- `services/auth/core/src/auth/auth.ts`（OAuth プロバイダー設定のみ異なる）

**重複している実装**:

- 環境判定ロジック（`isDevelopment`, `isProduction`）
- `cookieOptions`（domain/secure/sameSite/httpOnly/path のロジック）
- `cookieSuffix`（prod/dev/local 環境別サフィックス）
- `cookies` フィールド全体（sessionToken/callbackUrl/csrfToken/state/pkceCodeVerifier/nonce）
- `session` フィールド（strategy: `'jwt'`、maxAge: `30 * 24 * 60 * 60`）
- `callbacks.jwt`（トークンをそのまま返す）
- `callbacks.session`（token フィールドを session.user にマッピング）

**特記事項**:
- `services/auth/core/src/auth/auth.ts` のみ OAuth プロバイダー（Google）定義と DynamoDB ユーザー永続化処理を含む
- 上記 4 ファイル間で cookieOptions のコード全体が逐語的に重複しており、変更時に 4 箇所を同期する必要がある
- `services/stock-tracker/web/auth.ts` のみ `secret` フィールド設定を持つ（他は未設定）

---

### 1.2 NextAuth 型定義（next-auth.d.ts）【完全重複】

**ファイル一覧**:

- `services/auth/core/src/types/next-auth.d.ts`
- `services/admin/web/src/types/next-auth.d.ts`
- `services/niconico-mylist-assistant/web/src/types/next-auth.d.ts`
- `services/stock-tracker/web/types/next-auth.d.ts`

**重複している定義**:

- `Session.user`（id, email, name, image?, roles）
- `User`（id, email, name, image?）
- `JWT`（userId?, googleId?, email?, name?, picture?, roles?）

**特記事項**:
- auth/core と admin/web と niconico/web の 3 ファイルはほぼ同一内容
- stock-tracker は `DefaultSession['user']` との intersection 型を使っており微妙に異なる
- auth/core の next-auth.d.ts には「将来的に @nagiyu/common に移行を検討する」旨のコメントあり
- admin/web の next-auth.d.ts にも「Auth サービスと同一内容を保持する必要がある」旨のコメントあり

---

### 1.3 getSession 実装【構造重複】

**ファイル一覧**:

- `services/auth/web/src/lib/auth/session.ts`
- `services/admin/web/src/lib/auth/session.ts`
- `services/niconico-mylist-assistant/web/src/lib/auth/session.ts`
- `services/stock-tracker/web/lib/auth.ts`

**共通パターン**:

- `SKIP_AUTH_CHECK === 'true'` でモックセッションを返す
- `TEST_USER_EMAIL`, `TEST_USER_ROLES` 等の環境変数からモックデータを構築
- NextAuth の `auth()` を呼び出し、`session.user` の存在チェック後に変換して返す

**差異**:

| サービス | 返す Session 型 | id フィールド | name フィールド |
|---------|---------------|-------------|----------------|
| admin | サービス独自の軽量型 `{ user: { email, roles } }` | なし | なし |
| niconico | サービス独自型 `{ user: { id, email, name, image?, roles } }` | あり | あり |
| auth/web | `next-auth` の `Session` 型 | あり | あり |
| stock-tracker | `@nagiyu/common` の `Session` 型 | userId として | あり |

---

### 1.4 DynamoDB クライアント初期化【構造重複】

**ファイル一覧**:

- `services/auth/core/src/db/dynamodb-client.ts`（モジュールレベルシングルトン）
- `services/niconico-mylist-assistant/core/src/db/client.ts`（モジュールレベルシングルトン）
- `services/niconico-mylist-assistant/web/src/lib/aws-clients.ts`（クロージャシングルトン + BatchClient）
- `services/codec-converter/web/src/lib/aws-clients.ts`（クロージャシングルトン + BatchClient + S3Client）
- `services/stock-tracker/batch/src/lib/aws-clients.ts`（クロージャシングルトン）

**共通パターン**:

- `DynamoDBClient({ region: process.env.AWS_REGION || '...' })` で生成
- `DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } })`
- テーブル名を環境変数 `DYNAMODB_TABLE_NAME` から取得

**差異**:

- デフォルトリージョン: `us-east-1`（auth, codec-converter, niconico/web）vs `ap-northeast-1`（niconico/core, stock-tracker/batch）
- シングルトン実装方法: モジュールレベル vs クロージャ変数
- 同一ファイルに S3Client/BatchClient を含むサービスあり

---

### 1.5 ThemeRegistry コンポーネント【構造重複】

**ファイル一覧**:

- `services/admin/web/src/components/ThemeRegistry.tsx`
- `services/auth/web/src/components/ThemeRegistry.tsx`
- `services/codec-converter/web/src/components/ThemeRegistry.tsx`
- `services/niconico-mylist-assistant/web/src/components/ThemeRegistry.tsx`
- `services/stock-tracker/web/components/ThemeRegistry.tsx`
- `services/tools/src/components/ThemeRegistry.tsx`

**共通パターン**（全サービス共通）:

```
AppRouterCacheProvider
  └─ ThemeProvider（theme は @nagiyu/ui から）
      └─ CssBaseline
          └─ Box（flexDirection: column, minHeight: 100vh）
              ├─ Header or Navigation（サービス固有タイトル）
              ├─ Box component="main"（flexGrow: 1）
              └─ Footer
```

**差異**:

| サービス | MUI AppRouter バージョン | Header | Footer |
|---------|------------------------|--------|--------|
| admin | v16 | @nagiyu/ui Header | @nagiyu/ui Footer |
| auth | v15 | @nagiyu/ui Header | @nagiyu/ui Footer |
| codec-converter | v16 | @nagiyu/ui Header | @nagiyu/ui Footer |
| niconico | v16 | 独自 Navigation | @nagiyu/ui Footer |
| stock-tracker | v15 | @nagiyu/ui Header（+ SessionProvider, 権限メニュー） | @nagiyu/ui Footer |
| tools | v15 | なし（MigrationDialog のみ） | なし |

**特記事項**: `@mui/material-nextjs` のバージョン不整合（v15 vs v16）が存在する。

---

### 1.6 Health Route【完全重複】

**ファイル一覧**:

- `services/admin/web/src/app/api/health/route.ts`
- `services/auth/web/src/app/api/health/route.ts`
- `services/codec-converter/web/src/app/api/health/route.ts`
- `services/niconico-mylist-assistant/web/src/app/api/health/route.ts`
- `services/stock-tracker/web/app/api/health/route.ts`
- `services/tools/src/app/api/health/route.ts`

**共通パターン**:
- `NextResponse.json({ status: 'ok', timestamp: new Date().toISOString(), ... })` を返す GET ハンドラー

**差異**:

| サービス | service フィールド | version フィールド |
|---------|-------------------|-------------------|
| admin | `'admin'` | `process.env.APP_VERSION \|\| '1.0.0'` |
| auth | `'auth'` | `'1.0.0'`（ハードコード）|
| codec-converter | なし | なし |
| niconico | `'niconico-mylist-assistant'` | なし |
| stock-tracker | なし | `'1.0.0'`（ハードコード）|
| tools | なし | `process.env.APP_VERSION \|\| '1.0.0'` |

---

### 1.7 middleware.ts【構造重複】

**ファイル一覧**:

- `services/admin/web/src/middleware.ts`
- `services/niconico-mylist-assistant/web/src/middleware.ts`

**共通パターン**:

- `auth()` でラップ
- `SKIP_AUTH_CHECK === 'true'` でテスト時スキップ
- 未認証時に `NEXT_PUBLIC_AUTH_URL/signin` にリダイレクト
- `APP_URL` からコールバック URL を構築

**差異**:
- niconico はホームページ（`/`）のみ認証不要で通過させる処理が追加
- niconico の `config.matcher` は PWA 関連ファイル（manifest.json 等）を追加除外

---

## 2. libs/ への切り出し可否と構成案

### 2.1 `libs/nextjs` への追加（推奨）

**対象: createAuthConfig ファクトリ**

```
libs/nextjs/src/auth-config.ts（新規）
```

- auth.ts の cookieOptions / cookieSuffix / cookies フィールド / session フィールドを関数として提供
- `providers` と `callbacks.signIn` のみサービス側で注入する形式
- 依存: `next-auth`（libs/nextjs は既に Next.js を前提とするため問題なし）

切り出し後のイメージ:

```
services/admin/web/src/auth.ts          → createClientAuthConfig() を呼び出すだけ（JWT 検証のみ）
services/auth/core/src/auth/auth.ts     → createAuthServerConfig({ providers: [Google(...)] }) を呼び出すだけ（OAuth プロバイダーあり）
```

---

**対象: createHealthRoute ファクトリ**

```
libs/nextjs/src/health.ts（新規）
```

- `(options?: { serviceName?: string; version?: string }) => NextResponse` を export
- 呼び出し元は 1 行で health route を生成可能（オプションオブジェクトで拡張性を確保）
- 依存: `next/server`（libs/nextjs は Next.js 前提のため問題なし）

---

**対象: createMiddleware ファクトリ（任意）**

```
libs/nextjs/src/middleware.ts（新規）
```

- SKIP_AUTH_CHECK 処理、リダイレクト先構築ロジックを標準化
- `publicPaths` を引数として受け取り、例外パスを宣言的に指定する形式

---

### 2.2 `libs/nextjs` への next-auth 型定義追加

```
libs/nextjs/src/types/next-auth.d.ts（新規）
```

- 現在 4 サービスに重複している `next-auth.d.ts` をここに集約
- libs/nextjs はすでに Next.js 依存のライブラリのため `next-auth` への依存を追加しても問題なし
- 各サービスの `types/next-auth.d.ts` を削除し、libs/nextjs をインポートするだけにする

> **注意**: `libs/common` に next-auth 型定義を移動することは、common が next-auth に依存することになり、
> common の「ランタイム依存ゼロ」原則を崩すため **推奨しない**。
> libs/nextjs が適切な配置先である。

---

### 2.3 `libs/aws` への追加（推奨）

**対象: DynamoDB クライアントファクトリ**

```
libs/aws/src/dynamodb/client.ts（新規または既存 index.ts に追加）
```

- `getDynamoDBDocumentClient(region?: string): DynamoDBDocumentClient` を export
- シングルトン管理（クロージャパターン）を共通化
- `clearDynamoDBClientCache(): void`（テスト用リセット）を export
- `getTableName(defaultValue?: string): string`（環境変数検証付き）を export
- `libs/aws` は既にモノレポ内ライブラリに依存しないスタンドアロン構成のため追加可能

---

### 2.4 `libs/common` への追加（検討）

**対象: Session 型の統一**

現状、サービスによって使用する Session 型が異なる:

- `admin/web` は独自の軽量型（email + roles のみ）
- `niconico/web` は独自の中量型（id, email, name, image?, roles）
- `stock-tracker/web` は `@nagiyu/common` の User 型（userId, googleId, email, name, roles, createdAt, updatedAt）

`@nagiyu/common` の `Session.user` は DynamoDB の User エンティティをそのまま含んでおり、
フロントエンド用の薄いセッション表現としては過重な定義になっている。

選択肢:

1. `libs/common` に `SessionUser`（Web セッション用の軽量 User 部分型）を追加し、
   `Session<T extends SessionUser = SessionUser>` のようなジェネリクス形式にする
2. 現状維持し、NextAuth の `Session` 型拡張に統一する（next-auth.d.ts 共通化で対応）

---

### 2.5 `libs/ui` への移動（限定的）

ThemeRegistry の基本骨格（AppRouterCacheProvider + ThemeProvider + Box 構造）は
`libs/ui` に移動できる可能性があるが、以下の理由から現時点では慎重に判断:

- `libs/ui` が Next.js の `AppRouterCacheProvider` に直接依存することになる
  （現在は MUI コンポーネントと `@nagiyu/browser` のみに依存）
- 各サービスの Header title、Navigation 構成が異なるため、汎用化には props 設計が必要
- stock-tracker は `SessionProvider` と権限ベースのナビゲーション生成が必要（複雑）

**現実的な案**: `libs/ui` に `createThemeRegistry(options)` パターンの基底コンポーネントを追加し、
各サービスはそれを wrap する形にする（完全共通化ではなく骨格のみ共通化）。

---

## 3. 既存ライブラリで代替可能な独自実装

### 3.1 services/stock-tracker/core/src/services/auth.ts

- **内容**: `checkPermission()`, `getAuthError()`, `AUTH_ERROR_MESSAGES`
- **代替先**: `libs/nextjs/src/auth.ts` に既に `getAuthError()` が実装済み
- **対応**: stock-tracker/core の `services/auth.ts` から `@nagiyu/nextjs` を使用するか、
  `core` は `libs/nextjs` に依存しない（UI 非依存の原則）ため `@nagiyu/common` の `hasPermission()` を使用する形に整理

---

### 3.2 services/tools/src/lib/（clipboard, formatters, parsers）

**clipboard**:
- `services/tools/src/lib/__tests__/clipboard.test.ts` は `@nagiyu/browser` の `readFromClipboard`, `writeToClipboard` を import して使っており、**既に共通化済み**
- tools 独自の clipboard 実装は存在しない（テストが `@nagiyu/browser` を参照している）

**formatters / parsers**:
- `services/tools/src/lib/formatters/jsonFormatter.ts` は tools 固有のロジック（JSON 整形）
- `services/tools/src/lib/parsers/` も tools 固有（Transit 形式パーサー等）
- 他サービスで同様の処理は見当たらないため、現時点では共通化不要

---

### 3.3 services/admin/web/src/types/（User, Session）

- `services/admin/web/src/types/user.ts`（email + roles のみの軽量 User）
- `services/admin/web/src/types/auth.ts`（Session as `{ user: User }`）
- **代替先**: next-auth.d.ts の Session 型拡張で統一した後は不要になる可能性がある
- **対応**: next-auth.d.ts を `libs/nextjs` に集約した後に削除を検討

---

### 3.4 @nagiyu/nextjs の利用状況（stock-tracker 以外で未使用）

現状 `@nagiyu/nextjs` を使っているのは `services/stock-tracker` のみ。
他サービス（特に niconico）でも以下の機能が活用できる:

- `withRepository()` / `withRepositories()`: DynamoDB リポジトリ初期化パターン
- `withAuth()`: API ルートの認証・権限チェック
- `handleApiError()`: エラーレスポンス標準化
- `parsePagination()` / `createPaginatedResponse()`: ページネーション処理

---

## 4. 型定義の重複と共通化案

### 4.1 next-auth.d.ts 型定義

**現状の重複箇所（4 ファイル）**:

| ファイル | Session.user | User | JWT |
|---------|-------------|------|-----|
| `services/auth/core/src/types/next-auth.d.ts` | id, email, name, image?, roles | id, email, name, image? | userId?, googleId?, email?, name?, picture?, roles? |
| `services/admin/web/src/types/next-auth.d.ts` | 同上 | 同上 | 同上 |
| `services/niconico-mylist-assistant/web/src/types/next-auth.d.ts` | 同上 | 同上 | 同上 |
| `services/stock-tracker/web/types/next-auth.d.ts` | 同上（+ DefaultSession intersection） | 同上（+ roles） | userId?, email?, name?, picture?, roles?（googleId? なし） |

**共通化案**: `libs/nextjs/src/types/next-auth.d.ts` を新規作成して集約。

---

### 4.2 User / Session 型の整理

**現状**:

| 定義場所 | User フィールド |
|---------|----------------|
| `libs/common/src/auth/types.ts` | userId, googleId, email, name, roles, createdAt, updatedAt, lastLoginAt? |
| `services/auth/core/src/db/types.ts` | userId, googleId, email, name, picture?, roles, createdAt, updatedAt |
| `services/admin/web/src/types/user.ts` | email, roles（軽量版） |
| `services/niconico-mylist-assistant/web/src/types/auth.ts` | id, email, name, image?, roles |

**整理方針**:

- DynamoDB ストア用の完全 User エンティティ: `libs/common` の `User` 型（or `services/auth/core/src/db/types.ts` と統合）
- Web セッション（NextAuth）用: `libs/nextjs` の `next-auth.d.ts` 拡張型に一本化
- 各サービスの独自 Session / User 型: libs/nextjs への集約後に削除

---

### 4.3 @nagiyu/common の Permission 型への追加検討

現状 `libs/common/src/auth/types.ts` の `Permission` 型にはサービス固有のパーミッション
（stocks:read, stocks:write-own 等）が含まれているが、niconico 系のパーミッションは未定義。

niconico-mylist-assistant の認可要件が増えた場合は `Permission` 型への追加が必要。

---

## 5. タスク一覧

### フェーズ 1: 最重要・共通化ブロッカー解消

- [ ] T001: `libs/nextjs/src/types/next-auth.d.ts` を新規作成し、4 サービスの next-auth.d.ts を統合
    - 影響ファイル: 上記 1.2 の 4 ファイルを削除または空の再エクスポートに置き換え
- [ ] T002: `libs/nextjs/src/auth-config.ts` を新規作成し、cookieOptions / cookies / session の共通部分をファクトリ関数として提供
    - 影響ファイル: auth.ts 系 4 ファイルをリファクタリング
- [ ] T003: `libs/aws/src/dynamodb/client.ts` に `getDynamoDBDocumentClient()` / `getTableName()` / `clearDynamoDBClientCache()` を追加
    - 影響ファイル: aws-clients.ts 系 4 ファイル、dynamodb-client.ts

### フェーズ 2: 中優先度・利用率向上

- [ ] T004: `libs/nextjs/src/health.ts` を新規作成し、`createHealthRoute()` を提供
    - 影響ファイル: 6 サービスの `api/health/route.ts`
- [ ] T005: `@nagiyu/nextjs` の利用を niconico-mylist-assistant へ拡大
    - withRepository / withAuth / handleApiError / parsePagination を API ルートに適用
    - 影響ファイル: `services/niconico-mylist-assistant/web/src/app/api/**`
- [ ] T006: `services/admin/web/src/types/` の独自 User/Session 型を整理（T001 完了後）
    - `@nagiyu/nextjs` の next-auth.d.ts 型で代替可能な定義を削除

### フェーズ 3: 任意・品質向上

- [ ] T007: ThemeRegistry の基底コンポーネントを `libs/ui` に追加
    - AppRouterCacheProvider + ThemeProvider + Box の骨格を共通化
    - `@mui/material-nextjs` のバージョン統一（v16 に統一）
- [ ] T008: middleware.ts のリダイレクトロジックを `libs/nextjs` に抽出
    - `createAuthMiddleware({ publicPaths?: string[] })` のファクトリ関数
- [ ] T009: `services/stock-tracker/core/src/services/auth.ts` を整理
    - `@nagiyu/common` の hasPermission() に依存させ、独自実装を削減
- [ ] T010: `libs/common/src/auth/types.ts` の `Session` 型と `services/auth/core/src/db/types.ts` の `User` 型を統合
    - DynamoDB エンティティ用 User と Web セッション用 User の明確な分離

---

## 6. 参考ドキュメント

- `docs/development/rules.md` - コーディング規約・MUST ルール
- `docs/development/architecture.md` - アーキテクチャ方針・依存関係の原則
- `docs/README.md` - プロジェクト全般の方針
- `libs/nextjs/src/auth.ts` - withAuth 実装参考
- `libs/nextjs/src/repository.ts` - withRepository 実装参考
- `libs/aws/src/dynamodb/abstract-repository.ts` - DynamoDB 抽象リポジトリ基底クラス

---

## 7. 備考・未決定事項

- **Session 型の二重管理**: `@nagiyu/common` の `Session` 型（完全版）と
  NextAuth の `Session` 型拡張（フロントエンド向け）の役割分担を明確化する必要がある。
  stock-tracker は common の Session を getSession() の戻り型として使用しているが、
  nextauth の session と createdAt/updatedAt のフィールド整合に注意が必要。

- **`@nagiyu/nextjs` の利用拡大について**: codec-converter は `@nagiyu/common` を
  依存に含めていない（package.json 参照）。共通化推進にあわせて追加が必要。

- **デフォルトリージョンの不整合**: DynamoDB クライアントのデフォルトリージョンが
  `us-east-1`（auth, codec-converter, niconico/web）と `ap-northeast-1`（niconico/core, stock-tracker/batch）
  で分かれている。libs/aws にファクトリ化する際に統一方針を決定すること。
