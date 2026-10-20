# 認証・認可の統合ガイド

## 概要

このドキュメントは、nagiyu プラットフォームにおける認証・認可システムの概要と、新規サービスを統合する際の考慮事項をまとめたものです。

## アーキテクチャ概要

### 中央集約型認証

nagiyu プラットフォームは、Auth サービスを中心とした中央集約型の認証アーキテクチャを採用しています。

- **Auth サービス**: OAuth プロバイダーとの連携、JWT トークンの発行を担当
- **Consumer サービス**: Auth サービスが発行した JWT を検証し、認証状態を判定

### シングルサインオン (SSO)

`.nagiyu.com` ドメイン配下の全サービスで、セッション Cookie を共有することで SSO を実現しています。

- 環境別の Cookie 分離: dev 環境と prod 環境で異なる Cookie 名を使用（サフィックスで区別）
- ドメイン横断: `.nagiyu.com` ドメインで Cookie を共有

### トークン検証

Consumer サービスは、NextAuth の JWT 検証機能を利用して、Auth サービスが発行したトークンを検証します。

- 共通の秘密鍵を使用して JWT を検証
- プロバイダー設定は不要（Auth サービスのみが OAuth を処理）

---

## ロールの伝播とリフレッシュ

ロールはログイン時に JWT へ焼き込まれるため、そのままでは付与・変更がサインアウト→再ログインまで反映されない。これを「再ログイン不要」で反映するため、**ロールのリフレッシュは Auth サービスに集約**する（Consumer は DynamoDB を参照しない）。

### リフレッシュの仕組み（Auth 集約）

- Auth の jwt callback が DynamoDB からロールを再取得する契機は2つ:
  1. **TTL（既定 5 分）**: Auth ドメインへのリクエストで jwt callback が走った際、前回取得から TTL を超えていれば再取得する。
  2. **強制リフレッシュ（`trigger: 'update'`）**: Auth の `/refresh` ページが即時に再取得させる。
- 再取得した最新ロールは共有 Cookie（`.nagiyu.com`・同一 `AUTH_SECRET`）へ再発行され、全 Consumer に伝播する。**Consumer は共有 Cookie を読むだけ**で、自身ではロールを再取得しない。

### `/refresh` ページ（強制リフレッシュ）

Auth の `/refresh?callbackUrl=...` は `useSession().update()` で jwt callback を `trigger: 'update'` 起動し、ロールを即時再取得してから検証済み `callbackUrl` へ遷移する。

- **実装上の注意（next-auth v5）**: `update()` は **引数を渡さないと GET になり `trigger:'update'` が発火しない**。さらに **SessionProvider の初期読み込み中（`status === 'loading'`）に呼ぶと内部で即 return** される。したがって「**読み込み完了後に、引数つきで** `update({ ... })` を呼ぶ」必要がある（いずれかを満たさないと強制リフレッシュが効かず、TTL 経過まで反映されない）。
- `callbackUrl` は `@nagiyu/common` の `isAllowedNagiyuRedirectUrl`（同一オリジン / `*.nagiyu.com` のみ許可）で検証し、オープンリダイレクトを防ぐ。

### 初回 403 の導線（権限付与の反映フロー）

ログイン済みだが権限が無いユーザーには、URL を変えずにその場で `@nagiyu/ui` の `AccessDeniedView` を表示する。別ページへのリダイレクトや、権限が無い旨の 1 行表示にはしない。

権限の見方は 2 通りある。

- ミドルウェアで権限を見るサービス: `createAuthMiddleware` の `requiredPermission` を満たさないと、`/forbidden` へ rewrite する (URL はブラウザ上で変わらない)。rewrite 先は `forbiddenPath` で変えられる
- ページ内で権限を見る場合: そのページが `AccessDeniedView` を返す

権限が付与されたあとの流れは次のとおり。

1. `AccessDeniedView` は「アクセスを更新」「再ログイン」の 2 導線を出す
2. 「アクセスを更新」→ Auth の `/refresh` で最新ロールを取得 → 元ページへ復帰

戻り先は、ボタンを押した時点の現在の URL になる。URL が変わらないため、元のパスを別途受け渡す必要はない。

`/api` 配下は画面を出さず、従来どおり JSON の 403 を返す。呼び出し側がステータスで分岐できるようにするため。

これにより「管理者がロールを付与 → ユーザーはサインアウトせず “アクセスを更新” で反映」が成立する。

### 既知の制約: ロール降格（剥奪）の反映遅延

上記フローは**ロール付与**を即時化するが、**降格 (剥奪) は即時反映されない**。降格ユーザーは Cookie 上まだ権限を持つため 403 が出ず、権限なし画面も表示されない。かつ Consumer はロールを再取得しない。したがって降格の反映は次のいずれかまで遅延する:

- ユーザーが Auth ドメインを通過したとき（`/refresh` 経由、または TTL 経過後の Auth ドメインへのリクエスト）
- セッション期限（現状 30 日）

即時失効が必要な場合は別途対応が必要（本ガイド作成時点では未対応）。

---

## Consumer サービスの統合パターン

### ミドルウェアベース認証

ミドルウェアで全リクエストの認証状態を検証するパターンです。

**特徴:**

- リクエスト毎に自動的に認証チェックが実行される
- 未認証ユーザーを自動的に Auth サービスにリダイレクト
- 特定のパスを認証不要にすることも可能

**実装方針:**

- `@nagiyu/nextjs` の `createAuthMiddleware()` を使用する。オプションとして `getSignInBaseUrl`（サインインページの URL 生成）、`getCallbackUrl`（コールバック URL 生成）、`onAuthConfigError`（設定エラー時のハンドラー）を渡す。
- `SKIP_AUTH_CHECK` 環境変数を設定することで、開発・テスト時に認証チェックをバイパスできる。

**適用サービス例:**

- Admin: 全ページで認証必須
- Niconico Mylist Assistant: ホームページは公開、他は認証必須
- Stock Tracker: 全ページ認証必須（公開パスなし。ユーザー個別の株式データを扱うため）

### ページレベル認証

ミドルウェアを使わず、各ページでセッション取得と認証チェックを行うパターンです。

**特徴:**

- ページ単位で細かい制御が可能
- 認証（ログイン要否）をミドルウェアでゲートしつつ、ロール別の権限出し分け（`hasPermission`）を各ページ／コンポーネントで行う併用パターンも可

**適用サービス例:**

- Stock Tracker: 認証はミドルウェアでゲートし、ロール別の表示制御（`stocks:*`）は各ページで実施

---

## 統合時の一般的な問題と解決策

### 問題1: セッション Cookie の競合

**症状:**

- ログイン後、Consumer サービスにアクセスするとセッション Cookie が削除される
- 一度 Consumer サービスにアクセスすると、他のサービスでも SSO が解除される

**原因:**
Consumer サービスが独自の NextAuth インスタンスを持ち、Auth サービスの Cookie と競合している。

**解決策:**
Consumer サービスでは NextAuth の API ルートハンドラーを**配置しない**。

- Auth サービスのみが OAuth フローと Cookie 管理を担当
- Consumer サービスは JWT 検証のみを行う
- ミドルウェアがある場合でもルートハンドラーは不要

**例外:**
ミドルウェアを使用しないサービスでは、ルートハンドラーがあっても問題が発生しない場合がある。ただし、統一性のため配置しないことを推奨。

### 問題2: クライアントコンポーネントでの環境変数アクセス

**症状:**

- ログインボタンのリダイレクト URL が常に localhost になる
- デプロイ環境で正しい URL が使用されない

**原因:**
Next.js のクライアントコンポーネントは、プレフィックスなしの環境変数にアクセスできない。

**解決策:**
サーバーコンポーネントで環境変数を読み取り、クライアントコンポーネントに props として渡す。

- サーバーコンポーネント: 全ての環境変数にアクセス可能
- クライアントコンポーネント: NEXT*PUBLIC* プレフィックス付きの変数のみアクセス可能

### 問題3: CDK デプロイ時の Context 伝播

**症状:**

- Lambda 関数の環境変数（AUTH_SECRET など）がデプロイ後にデフォルト値（PLACEHOLDER）に戻る
- 個別のスタックデプロイでは正常だが、別のスタックをデプロイすると値が上書きされる

**原因:**
CDK でスタックを個別にデプロイする際、依存するスタックが再評価されるが、その時に Context が渡されないとデフォルト値が使用される。

**メカニズム:**

1. Lambda Stack を Context 付きでデプロイ → 正常に設定される
2. IAM Stack をデプロイ（Lambda Stack に依存）
3. CDK が Lambda Stack を再評価するが、Context がないためデフォルト値を使用
4. Lambda の環境変数が上書きされる

**解決策:**
全てのアプリケーションスタックを一度にデプロイする。

- --all フラグを使用して全スタックをまとめてデプロイ
- インフラスタック（ECR、DynamoDB など）は --exclude で除外
- Context は1回のコマンドで全スタックに適用される

**デプロイ構成例:**

- インフラスタック: 個別にデプロイ（ECR、DynamoDB など）
- アプリケーションスタック: まとめてデプロイ（Lambda、Batch、IAM、CloudFront など）

### 問題4: サインアウト後に内部ホスト名へリダイレクトされる

**症状:**

- Consumer から `/api/auth/signout` を直接叩くと、ECS タスクの内部ホスト名（例: `ip-10-x-x-x.ec2.internal:3000`）へリダイレクトされ `ERR_NAME_NOT_RESOLVED` で失敗する。

**原因:**

- ALB 配下の ECS で、NextAuth が自身の base URL を持たない（`AUTH_URL` / `NEXTAUTH_URL` 未設定）と内部アドレスへフォールバックする。
- かつ Consumer がローカルに signout（POST）ハンドラを露出していた。

**解決策:**

- サインアウトは **Auth サービスに集約**する。Consumer は signout を持たず、共通 `Header` 等から Auth の signout（`callbackUrl` 付き）へ遷移する（問題1の「ルートハンドラーを配置しない」と同じ方針）。
- 各 NextAuth インスタンスに自サービスの公開 URL（`AUTH_URL` / `APP_URL`）を明示し、内部ホストへのフォールバックを防ぐ。

---

## セッション型の設計方針

`@nagiyu/common` には、似て非なる 2 種類のユーザー型がある。混同しないよう用途で分ける。

### User (DB 上のユーザー)

DynamoDB に永続化されたユーザーエンティティ。`userId` / `googleId` / `createdAt` / `updatedAt` / `lastLoginAt` 等を持つ。Auth サービスのリポジトリ層やバッチ処理など、DB を直接読み書きする箇所で使う。API ルートや画面が受け取るセッションの型には使わない。

### Session / SessionUser (セッション)

JWT から復元される、リクエスト時点の認証済みユーザーを表す。`SessionUser` は `id` / `email` / `name` / `image?` / `roles` だけを持ち、DB にしかない値 (`googleId` や作成日時) は含まない。`@nagiyu/nextjs` の `types/next-auth.d.ts` は next-auth の `Session['user']` をこの `SessionUser` で拡張しているため、サーバー側の `getSession()` が返す値とクライアントの `useSession()` が返す値は同じ形になる。

DB の値が必要なサーバー側の処理は、セッションの `user.id` をキーに DynamoDB を参照する。サービスごとに独自のセッション型を定義したり、存在しない値を埋めて変換したりしない。

---

## NextAuth 設定の統一パターン

### Auth サービスと Consumer サービスの役割分担

- **Auth サービス**: `@nagiyu/nextjs` の `createAuthServerConfig({ providers })` を使用。OAuth プロバイダー定義と DynamoDB ユーザー永続化処理をサービス側で注入する。
- **Consumer サービス**: `@nagiyu/nextjs` の `createClientAuthConfig()` を使用。JWT 検証のみを行い、OAuth プロバイダー設定は不要。

Cookie オプション（`domain`, `secure`, `sameSite`, `httpOnly` 等）・セッション設定・コールバックの共通部分はファクトリ関数内に集約されており、サービス側で個別に定義しない。

---

## ミドルウェアの統一パターン

ミドルウェアを使用する全 Consumer サービスは `@nagiyu/nextjs` の `createAuthMiddleware()` を使用する。認証不要なパス（公開パス）の設定はミドルウェアのオプションで行う。サービス側でミドルウェアのロジックを個別実装しない。

---

## セッション取得の統一パターン

全 Consumer サービスのセッション取得は `@nagiyu/nextjs` の `createSessionGetter()` を使用する。戻り値は全サービスで `@nagiyu/common` の `Session | null` に揃う。

- `auth`: サービスの auth 関数を `auth as () => Promise<Session | null>` として渡す
- `defaultRoles`: `SKIP_AUTH_CHECK` が有効なときのテストセッションで、ロールが未指定の場合に使う既定ロールを渡す (**省略可**)

テストセッションはライブラリが組み立てる。ロールはヘッダ `x-test-user-roles`、`TEST_USER_ROLES`、`defaultRoles` の順に解決する。サービス側にセッションの変換やテストセッションの生成は持たない。

セッション取得ロジックをサービス側で個別実装しない。

---

### 環境変数の命名

- **AUTH_SECRET**: JWT 検証用の秘密鍵（全サービス共通、Secrets Manager で管理）
- **NEXT_PUBLIC_AUTH_URL**: Auth サービスの URL（クライアントからアクセス可能）
- **APP_URL**: 自サービスの URL（サーバーサイドのみ、callbackUrl 構築に使用）

### Cookie 設定

- 環境別にサフィックスを付与（dev: .dev、prod: なし）
- ドメインは .nagiyu.com（ローカル開発時は未設定）
- secure フラグは本番環境のみ有効
- httpOnly を有効にしてセキュリティを確保

### デプロイワークフロー

- Secret は GitHub Actions で Secrets Manager から取得
- CDK Context として全てのデプロイコマンドに渡す
- --all を使用してアプリケーションスタックをまとめてデプロイ
- インフラスタックは事前に個別デプロイ

### セキュリティ

- AUTH_SECRET は全サービスで統一（Auth サービスで生成、他サービスは共有）
- JWT の有効期限は適切に設定（現状: 30日）
- CORS 設定は必要最小限に制限
- リダイレクト先 URL は `@nagiyu/common` の `isAllowedNagiyuRedirectUrl`（同一オリジン / `*.nagiyu.com` のみ許可・ホスト名の完全一致で判定）で検証し、オープンリダイレクトを防ぐ（前方一致は `https://auth.nagiyu.com.evil.com` 等を許してしまうため不可）

---

## 参考情報

### 関連ドキュメント

- Auth サービス: `docs/services/auth/`
- アーキテクチャ全体: `docs/development/architecture.md`
- モノレポ構成: `docs/development/monorepo-structure.md`

### 既存の実装例

- **ミドルウェアあり、ルートハンドラーなし**: Admin、Niconico Mylist Assistant、Stock Tracker

新規サービスを追加する際は、これらの実装を参考にしてください。
