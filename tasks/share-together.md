# みんなでシェアリスト (Share Together) 実装計画

## 概要

他者間で ToDo を共有できるサービス。Auth サービスで認証されたユーザーが個人 ToDo リストを管理しつつ、グループを作成してグループメンバー間で共有 ToDo リストを利用できる。

本ドキュメントは MVP（初版）の実装指針であり、`task.implement` エージェントが実装タスクを実行する際の詳細な指示書となる。

## 関連情報

- **タスクタイプ**: サービスタスク（share-together）
- **仕様書**: `specs/001-share-together/spec.md`
- **要件チェックリスト**: `specs/001-share-together/checklists/requirements.md`
- **参考サービス（認証・インフラ）**: `services/stock-tracker/`
- **ブランチ戦略**: `001-share-together` ブランチで開発

---

## 要件

### 機能要件（FR）

#### FR-001〜003: 認証

- FR-001: 未認証ユーザーのアクセス時、Auth サービスのログインページへリダイレクトする
- FR-002: Auth サービスが発行した JWT を検証してユーザーを識別する
- FR-003: ログアウト操作でセッションを終了する

#### FR-004〜009: 個人 ToDo リスト

- FR-004: 初回ログイン時にデフォルト個人リストを自動生成する
- FR-005: 追加の個人 ToDo リストを任意の数だけ作成できる
- FR-006: デフォルト以外の個人リストの名称変更・削除ができる
- FR-007: デフォルト個人リストの削除を禁止する
- FR-008: 個人リスト内で ToDo の作成・編集・削除・完了状態変更ができる
- FR-009: 個人リストとその内容を本人以外には非公開とする

#### FR-010〜016: グループ管理

- FR-010: グループを作成できる（作成者がオーナー）
- FR-011: オーナーはユーザー ID またはメールアドレスで他ユーザーを招待できる
- FR-012: 招待されたユーザーは招待を承認または拒否できる
- FR-013: グループメンバーは自発的にグループから脱退できる
- FR-014: グループオーナーは任意のメンバーを除外できる
- FR-015: グループオーナーはグループを削除できる（関連する全共有リスト・データも削除）
- FR-016: ユーザーは複数のグループに所属できる

#### FR-017〜021: グループ共有 ToDo リスト

- FR-017: グループメンバーはグループに紐づく共有 ToDo リストを複数作成できる
- FR-018: グループメンバーはグループの全共有 ToDo リストを閲覧できる
- FR-019: グループメンバーは共有リスト内で ToDo の作成・編集・削除・完了状態変更ができる
- FR-020: グループ共有リストをグループメンバー以外には非公開とする
- FR-021: グループメンバーはグループ共有リストの名称変更・削除ができる

### 非機能要件（NFR）

- NFR-001: TypeScript strict mode 必須
- NFR-002: core パッケージのテストカバレッジ 80% 以上
- NFR-003: モバイルファーストの UI 設計（PWA 対応）
- NFR-004: ページ更新時に最新状態を表示できること（リアルタイム同期は MVP 対象外）
- NFR-005: 未認証・非メンバーによる不正アクセスを API レベルで完全に防ぐ
- NFR-006: 既存 Auth サービスで認証済みのユーザーが追加ログインなしで利用できる（SSO）

### MVP スコープ外

- ToDo への期限設定・プッシュ通知
- リアルタイム同期（WebSocket 等）
- グループ内の細かい権限管理
- ToDo へのコメント・添付ファイル
- メール通知

---

## 実装方針

### 技術スタック

| 層 | 技術 | 理由 |
|---|---|---|
| Web フレームワーク | Next.js (App Router) | プラットフォーム標準 |
| 認証 | next-auth v5 + Auth サービス JWT | stock-tracker と同パターン |
| データベース | DynamoDB シングルテーブル | プラットフォーム標準 |
| インフラ | AWS CDK (TypeScript) | プラットフォーム標準 |
| コンテナ | Docker (Lambda コンテナ) | プラットフォーム標準 |
| CDN | CloudFront | プラットフォーム標準 |
| PWA | next-pwa | stock-tracker で使用実績あり |
| UI ライブラリ | @nagiyu/ui (Material UI ベース) | プラットフォーム標準 |

### サービス構成

```
services/share-together/
    core/          # ビジネスロジック（フレームワーク非依存）
    web/           # Next.js Web アプリケーション
```

batch は不要（バッチ処理なし）。

### パッケージ名

- core: `@nagiyu/share-together-core`
- web: `@nagiyu/share-together-web`

### ディレクトリ構成（web）

```
services/share-together/web/
    app/
        api/
            auth/[...nextauth]/route.ts
            health/route.ts
            lists/
                personal/route.ts          # 個人リスト一覧・作成
                personal/[listId]/route.ts # 個人リスト更新・削除
                personal/[listId]/todos/route.ts
                personal/[listId]/todos/[todoId]/route.ts
            groups/
                route.ts                   # グループ一覧・作成
                [groupId]/route.ts         # グループ詳細・更新・削除
                [groupId]/members/route.ts # メンバー管理
                [groupId]/lists/route.ts   # グループ共有リスト一覧・作成
                [groupId]/lists/[listId]/route.ts
                [groupId]/lists/[listId]/todos/route.ts
                [groupId]/lists/[listId]/todos/[todoId]/route.ts
            invitations/
                route.ts                   # 自分宛ての招待一覧
                [invitationId]/route.ts    # 招待の承認・拒否
        (home)/                            # ルートグループ（認証必須）
            page.tsx                       # トップ（デフォルト個人リスト）
            layout.tsx
        groups/
            page.tsx                       # グループ一覧
            [groupId]/
                page.tsx                   # グループ詳細
                lists/[listId]/page.tsx    # グループ共有リスト
        invitations/
            page.tsx                       # 招待通知一覧
    components/
    lib/
    types/
    auth.ts
    middleware.ts
    public/
        manifest.json
        sw.js                              # Service Worker（将来のプッシュ通知用ガワ）
        icon-192x192.png
        icon-512x512.png
```

### ディレクトリ構成（core）

```
services/share-together/core/
    src/
        types/
            user.ts
            list.ts
            group.ts
            membership.ts
            todo.ts
            invitation.ts
        repositories/
            interfaces/
            dynamodb/
            in-memory/             # テスト用
        services/
            auth.ts                # JWT検証
            user.ts
            personal-list.ts
            group.ts
            membership.ts
            group-list.ts
            todo.ts
            invitation.ts
        mappers/
        validation/
    tests/unit/
```

---

## データモデル

### DynamoDB シングルテーブル設計

テーブル名: `nagiyu-share-together-main-{environment}`

#### キー設計

| エンティティ | PK | SK | 備考 |
|---|---|---|---|
| User | `USER#{userId}` | `PROFILE` | 初回ログイン時に作成 |
| Personal List | `USER#{userId}` | `LIST#PERSONAL#{listId}` | デフォルトリストは listId = `default` |
| Todo Item (Personal) | `LIST#{listId}` | `TODO#{todoId}` | |
| Group | `GROUP#{groupId}` | `METADATA` | |
| Membership | `GROUP#{groupId}` | `MEMBER#{userId}` | status: `invited` / `active` / `rejected` |
| Group List | `GROUP#{groupId}` | `LIST#{listId}` | |
| Todo Item (Group) | `LIST#{listId}` | `TODO#{todoId}` | Personal と同構造 |
| Invitation | `USER#{userId}` | `INVITATION#{groupId}` | 招待受け取り側から検索するため |

#### 属性定義

**User**

```
PK: USER#{userId}
SK: PROFILE
userId: string       # Auth サービスのユーザーID
email: string
name: string
createdAt: string    # ISO 8601
updatedAt: string
```

**Personal List**

```
PK: USER#{userId}
SK: LIST#PERSONAL#{listId}
listId: string
name: string
isDefault: boolean
ownerId: string      # userId
createdAt: string
updatedAt: string
GSI1PK: USER#{userId}    # ユーザーの全個人リスト取得用
GSI1SK: LIST#PERSONAL#{listId}
```

**Todo Item**

```
PK: LIST#{listId}
SK: TODO#{todoId}
todoId: string
title: string
completed: boolean
createdBy: string    # userId
listId: string
createdAt: string
updatedAt: string
```

**Group**

```
PK: GROUP#{groupId}
SK: METADATA
groupId: string
name: string
ownerId: string
createdAt: string
updatedAt: string
```

**Membership**

```
PK: GROUP#{groupId}
SK: MEMBER#{userId}
userId: string
groupId: string
role: "owner" | "member"
status: "active"
joinedAt: string
GSI1PK: USER#{userId}    # ユーザーが所属するグループ一覧取得用
GSI1SK: GROUP#{groupId}
```

**Invitation**

```
PK: USER#{inviteeId}
SK: INVITATION#{groupId}
inviteeId: string
groupId: string
groupName: string    # 非正規化（表示用）
invitedBy: string    # userId
status: "pending" | "accepted" | "rejected"
createdAt: string
updatedAt: string
```

**Group List**

```
PK: GROUP#{groupId}
SK: LIST#{listId}
listId: string
groupId: string
name: string
createdBy: string
createdAt: string
updatedAt: string
GSI1PK: GROUP#{groupId}    # グループの全共有リスト取得用
GSI1SK: LIST#{listId}
```

#### GSI 設計

| GSI 名 | GSI1PK | GSI1SK | 用途 |
|---|---|---|---|
| UserIndex | `USER#{userId}` | エンティティ種別 SK | ユーザーの個人リスト一覧、所属グループ一覧、招待一覧 |

---

## API インターフェース

すべての API は Next.js Route Handlers で実装し、認証チェックを必須とする。

### 認証

```
GET  /api/auth/[...nextauth]    NextAuth ハンドラー
POST /api/auth/[...nextauth]    NextAuth ハンドラー
```

### ヘルスチェック

```
GET  /api/health                デプロイ確認用（認証不要）
```

### 個人 ToDo リスト

```
GET    /api/lists/personal
    Response: { lists: PersonalList[] }

POST   /api/lists/personal
    Body: { name: string }
    Response: { list: PersonalList }

PUT    /api/lists/personal/{listId}
    Body: { name: string }
    Response: { list: PersonalList }
    デフォルトリストへの名前変更は許可

DELETE /api/lists/personal/{listId}
    デフォルトリストは 403 を返す

GET    /api/lists/personal/{listId}/todos
    Response: { todos: TodoItem[] }

POST   /api/lists/personal/{listId}/todos
    Body: { title: string }
    Response: { todo: TodoItem }

PUT    /api/lists/personal/{listId}/todos/{todoId}
    Body: { title?: string; completed?: boolean }
    Response: { todo: TodoItem }

DELETE /api/lists/personal/{listId}/todos/{todoId}
    Response: 204 No Content
```

### グループ

```
GET    /api/groups
    Response: { groups: Group[] }    # 自分が所属するグループ一覧

POST   /api/groups
    Body: { name: string }
    Response: { group: Group }

GET    /api/groups/{groupId}
    Response: { group: Group; members: Member[] }
    メンバー以外は 403

DELETE /api/groups/{groupId}
    オーナーのみ可。関連データをすべて削除

POST   /api/groups/{groupId}/members
    Body: { userId?: string; email?: string }
    オーナーのみ。UserID またはメールアドレスを直接指定して招待を作成する（ユーザー検索は行わない）
    指定された UserID またはメールアドレスに一致する User レコードが存在しない場合は 404 を返す
    Response: { invitation: Invitation }

DELETE /api/groups/{groupId}/members/{userId}
    オーナーによる除外またはメンバー自身による脱退
    オーナー自身の脱退は 403（グループ削除を使用すること）
```

### グループ共有リスト

```
GET    /api/groups/{groupId}/lists
    Response: { lists: GroupList[] }
    メンバー以外は 403

POST   /api/groups/{groupId}/lists
    Body: { name: string }
    Response: { list: GroupList }
    メンバー以外は 403

PUT    /api/groups/{groupId}/lists/{listId}
    Body: { name: string }
    メンバー以外は 403

DELETE /api/groups/{groupId}/lists/{listId}
    メンバー以外は 403

GET    /api/groups/{groupId}/lists/{listId}/todos
    Response: { todos: TodoItem[] }

POST   /api/groups/{groupId}/lists/{listId}/todos
    Body: { title: string }
    Response: { todo: TodoItem }

PUT    /api/groups/{groupId}/lists/{listId}/todos/{todoId}
    Body: { title?: string; completed?: boolean }

DELETE /api/groups/{groupId}/lists/{listId}/todos/{todoId}
    Response: 204 No Content
```

### 招待

```
GET    /api/invitations
    Response: { invitations: Invitation[] }    # pending のみ

PUT    /api/invitations/{groupId}
    Body: { action: "accept" | "reject" }
    承認時: Membership レコードを active で作成、Invitation を accepted に更新
    拒否時: Invitation を rejected に更新
```

---

## 認証フロー

stock-tracker と同パターンを採用する。

### auth.ts の設計

`services/share-together/web/auth.ts` に NextAuth 設定を実装。

- `providers: []`（Auth サービスが OAuth を管理するため不要）
- Cookie は `.nagiyu.com` ドメインで共有し SSO を実現
- 環境別 Cookie 名サフィックス:
    - prod: サフィックスなし
    - dev: `.dev`
    - local: サフィックスなし
- `session.strategy: 'jwt'`
- `callbacks.session` で `session.user.id`, `email`, `name`, `roles` をマッピング
- `pages.signIn`: `${process.env.NEXT_PUBLIC_AUTH_URL}/signin`

### middleware.ts

Next.js Middleware でルート保護を実装。

- `/api/health` 以外の全ルートで認証を必須とする
- 未認証の場合は Auth サービスのサインインページへリダイレクト

### 環境変数

```
AUTH_SECRET          # NextAuth のシークレット（Secrets Manager から注入）
NEXTAUTH_SECRET      # フォールバック用
NEXT_PUBLIC_AUTH_URL # Auth サービスの URL
AWS_REGION
DYNAMODB_TABLE_NAME
```

---

## PWA 設定

### manifest.json

```json
{
    "name": "みんなでシェアリスト",
    "short_name": "ShareTogether",
    "description": "みんなでToDoを共有できるツール",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#ffffff",
    "theme_color": "#1976d2",
    "icons": [
        {
            "src": "/icon-192x192.png",
            "sizes": "192x192",
            "type": "image/png",
            "purpose": "any maskable"
        },
        {
            "src": "/icon-512x512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "any maskable"
        }
    ]
}
```

### Service Worker（将来のプッシュ通知用ガワ）

`public/sw.js` に最小限の Service Worker を配置。MVP ではプッシュ通知を実装しないが、将来の拡張に備えてガワのみ用意する。

- `install` / `activate` イベントハンドラーを定義
- `push` イベントハンドラーをコメントアウト状態またはスタブで用意
- VAPID キーの準備: AWS Secrets Manager に `nagiyu-share-together-vapid-{env}` として保存（ガワのみで実使用しないが、インフラ設計として準備する）

### ServiceWorkerRegistration コンポーネント

`components/ServiceWorkerRegistration.tsx` に Service Worker 登録コンポーネントを実装。

- stock-tracker の実装を参考にする
- MVP ではプッシュ通知の購読処理は行わず、Service Worker の登録のみ実施

### next.config.ts

`next-pwa` プラグインを使用（stock-tracker と同バージョン）。

```typescript
import withPWA from 'next-pwa';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    output: 'standalone',
    transpilePackages: [
        '@nagiyu/ui',
        '@nagiyu/browser',
        '@nagiyu/common',
        '@nagiyu/aws',
        '@nagiyu/share-together-core',
    ],
    env: {
        NEXT_PUBLIC_SERVICE_NAME: 'share-together',
    },
};

export default withPWA({
    dest: 'public',
    register: false,     // ServiceWorkerRegistration コンポーネントで手動登録
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development',
})(nextConfig);
```

---

## インフラ設計

### CDK スタック構成

`infra/share-together/` に以下のスタックを配置する。

```
infra/share-together/
    bin/share-together.ts          # CDK App エントリポイント
    lib/
        ecr-stack.ts               # ECR リポジトリ（Web）
        dynamodb-stack.ts          # DynamoDB シングルテーブル
        iam-stack.ts               # IAM ロール・ポリシー
        secrets-stack.ts           # Secrets Manager（AUTH_SECRET, VAPID）
        lambda-stack.ts            # Lambda Function URL（Web）
        cloudfront-stack.ts        # CloudFront ディストリビューション
        share-together-stack.ts    # メインスタック（各スタックを組み合わせ）
        policies/
            web-runtime-policy.ts  # Web Lambda の IAM ポリシー
    package.json
    tsconfig.json
    cdk.json
```

パッケージ名: `@nagiyu/infra-share-together`

### 各スタックの詳細

#### ecr-stack.ts

- ECR リポジトリ名: `nagiyu-share-together-web-ecr-{env}`
- `CloudFrontStackBase` や `EcrStackBase` など `@nagiyu/infra-common` のベースクラスを活用

#### dynamodb-stack.ts

```typescript
// テーブル名: nagiyu-share-together-main-{env}
// PK: string, SK: string
// GSI1 (UserIndex): GSI1PK (string), GSI1SK (string)
// billingMode: PAY_PER_REQUEST
// pointInTimeRecovery: true
// encryption: AWS_MANAGED
// TTL属性: TTL
// prod: RETAIN, dev: DESTROY
```

#### lambda-stack.ts

- 関数名: `nagiyu-share-together-web-{env}`
- ランタイム: Docker コンテナ（ECR イメージ）
- Function URL 有効化（Lambda Function URL）
- タイムアウト: 30 秒
- メモリ: 512 MB
- 環境変数: `NODE_ENV`, `DYNAMODB_TABLE_NAME`, `AUTH_SECRET`, `NEXT_PUBLIC_AUTH_URL`, `VAPID_PUBLIC_KEY`（将来用）

#### cloudfront-stack.ts

- `CloudFrontStackBase` を継承
- ドメイン設定:
    - dev: `dev-share-together.nagiyu.com`（外部 DNS で CNAME 登録）
    - prod: `share-together.nagiyu.com`（外部 DNS で CNAME 登録）
- `enableSecurityHeaders: true`
- `enableHttp3: true`
- priceClass: prod は `PriceClass_All`、dev は `PriceClass_100`

#### secrets-stack.ts

- `nagiyu-auth-nextauth-secret-{env}`: AUTH_SECRET（Auth サービスと共有）
- `nagiyu-share-together-vapid-{env}`: VAPID キーペア（将来のプッシュ通知用）

#### web-runtime-policy.ts

DynamoDB へのアクセス権限を付与:

- `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, `BatchWriteItem`
- テーブル ARN および GSI ARN への権限

---

## CI/CD

### ワークフロー構成

stock-tracker のワークフロー構成に倣い、以下の 3 ファイルを作成する。

```
.github/workflows/
    share-together-verify-fast.yml    # PR 時の高速検証
    share-together-verify-full.yml    # PR 時の完全検証
    share-together-deploy.yml         # デプロイ
```

### share-together-verify-fast.yml

**トリガー**: PR → `integration/**` ブランチ、対象パス変更時

**ジョブ構成**:

```
lint ──────────────────────────────────┐
format-check ─────────────────────────┼─ build-core ─┬─ build-web ─┬─ e2e-test-web (chromium-mobile only)
                                       │              │             └─ docker-build-web
                                       │              └─ test-core
                                       └─ synth-infra ─ build-infra
report (always, PR コメント作成)
```

**対象パス**:
- `services/share-together/**`
- `libs/**`
- `infra/share-together/**`
- `package.json`, `package-lock.json`

### share-together-verify-full.yml

**トリガー**: PR → `integration/**` ブランチ（fast と同じ）

**fast との差分**:
- E2E テストを全プロジェクト（chromium, firefox, webkit, chromium-mobile）で実行

### share-together-deploy.yml

**トリガー**: push → `develop`, `integration/**`, `master` ブランチ、または workflow_dispatch

**ジョブ構成**:

```
infrastructure-ecr
    ↓
build-web (Docker Build → ECR Push)
    ↓
infrastructure-app (CDK deploy --all)
    ↓
Lambda update-function-code
    ↓
verify (ヘルスチェック)
```

**環境判定**:
- `master` → prod
- その他 → dev
- `workflow_dispatch` → 選択した環境

**デプロイするスタック**:
- `NagiyuShareTogetherWebECR{Suffix}`
- `NagiyuShareTogetherDynamoDB{Suffix}`
- `NagiyuShareTogetherSecrets{Suffix}`
- `NagiyuShareTogetherIAM{Suffix}`
- `NagiyuShareTogetherLambda{Suffix}`
- `NagiyuShareTogetherCloudFront{Suffix}`

---

## タスク分解

### フェーズ 0: 準備・スキャフォールディング

- [ ] T001: `services/share-together/` ディレクトリ構造を作成（core/web）
- [ ] T002: core パッケージのスキャフォールド（package.json, tsconfig.json, eslint.config.mjs, jest.config.ts）
- [ ] T003: web パッケージのスキャフォールド（package.json, tsconfig.json, next.config.ts, 基本 app/ 構造）
- [ ] T004: `infra/share-together/` ディレクトリ構造を作成
- [ ] T005: モノレポの `package.json` の `workspaces` に新パッケージを追加
- [ ] T006: `services/share-together/web/auth.ts` を stock-tracker の実装を参考に作成
- [ ] T007: `services/share-together/web/middleware.ts` を作成

### フェーズ 1: コアビジネスロジック

- [ ] T101: 型定義の作成（`core/src/types/`）: User, PersonalList, Group, Membership, GroupList, TodoItem, Invitation
- [ ] T102: DynamoDB リポジトリ インターフェース定義（`core/src/repositories/interfaces/`）
- [ ] T103: DynamoDB クライアントユーティリティ（PK/SK パターンの定数・ビルダー関数）
- [ ] T104: User リポジトリ実装（DynamoDB）: `getUser`, `createUser`
- [ ] T105: PersonalList リポジトリ実装（DynamoDB）: `getListsByUser`, `createList`, `updateList`, `deleteList`
- [ ] T106: TodoItem リポジトリ実装（DynamoDB）: `getTodosByList`, `createTodo`, `updateTodo`, `deleteTodo`
- [ ] T107: Group リポジトリ実装（DynamoDB）: `getGroupsByUser`, `getGroup`, `createGroup`, `deleteGroup`
- [ ] T108: Membership リポジトリ実装（DynamoDB）: `getMembership`, `createMembership`, `deleteMembership`, `getMembersByGroup`
- [ ] T109: Invitation リポジトリ実装（DynamoDB）: `getPendingInvitationsByUser`, `createInvitation`, `updateInvitation`
- [ ] T110: GroupList リポジトリ実装（DynamoDB）: `getListsByGroup`, `createList`, `updateList`, `deleteList`
- [ ] T111: インメモリリポジトリ実装（テスト用: User, PersonalList, TodoItem, Group, Membership, Invitation, GroupList）
- [ ] T112: バリデーション関数（zod を使用: リスト名、ToDo タイトル、グループ名の入力検証）
- [ ] T113: core ユニットテスト（カバレッジ 80% 以上）

### フェーズ 2: Web API 実装

- [ ] T201: `GET /api/health` ルート
- [ ] T202: 個人リスト CRUD API（`/api/lists/personal/**`）
- [ ] T204: ToDo CRUD API（個人リスト用: `/api/lists/personal/[listId]/todos/**`）
- [ ] T205: グループ CRUD API（`/api/groups/**`）
- [ ] T206: グループメンバー管理 API（招待送信・除外・脱退）
- [ ] T207: グループ共有リスト CRUD API（`/api/groups/[groupId]/lists/**`）
- [ ] T208: ToDo CRUD API（グループ共有リスト用）
- [ ] T209: 招待管理 API（一覧・承認・拒否: `/api/invitations/**`）
- [ ] T210: 初回ログイン処理（NextAuth `signIn` コールバックでデフォルト個人リスト作成）

### フェーズ 3: フロントエンド実装

- [ ] T301: アプリ全体のレイアウト（`app/layout.tsx`）: MUI テーマ、SessionProvider、ServiceWorkerRegistration
- [ ] T302: トップページ（デフォルト個人 ToDo リスト表示）
- [ ] T303: 個人リスト切り替え・管理 UI（リスト一覧サイドバーまたはドロワー）
- [ ] T304: ToDo アイテム一覧・操作 UI（追加・完了トグル・編集・削除）
- [ ] T305: グループ一覧ページ（`/groups`）
- [ ] T306: グループ作成・詳細・設定 UI（メンバー一覧、招待フォーム（UserID またはメールアドレスを直接入力）、メンバー除外）
- [ ] T307: グループ共有 ToDo リスト UI（グループリスト一覧・切り替え・ToDo 操作）
- [ ] T308: 招待通知ページ（`/invitations`）: 招待一覧・承認・拒否 UI
- [ ] T309: モバイルレスポンシブ対応（モバイルファーストで全ページ確認）
- [ ] T310: エラーハンドリング UI（API エラー、未認証、403 等）
- [ ] T311: ローディング状態 UI（Suspense / スケルトン）

### フェーズ 4: PWA 設定

- [ ] T401: `public/manifest.json` 作成
- [ ] T402: アプリアイコン作成（192x192, 512x512 PNG）
- [ ] T403: `public/sw.js` 作成（プッシュ通知のガワのみ: install/activate ハンドラー + push ハンドラースタブ）
- [ ] T404: `components/ServiceWorkerRegistration.tsx` 作成（Service Worker 登録のみ、購読処理なし）
- [ ] T405: `next.config.ts` に `next-pwa` を設定

### フェーズ 5: インフラ実装

- [ ] T501: `infra/share-together/package.json`, `tsconfig.json`, `cdk.json` 作成
- [ ] T502: `bin/share-together.ts`（CDK App エントリポイント）
- [ ] T503: `lib/ecr-stack.ts`
- [ ] T504: `lib/dynamodb-stack.ts`（シングルテーブル、GSI1 UserIndex）
- [ ] T505: `lib/secrets-stack.ts`（AUTH_SECRET, VAPID）
- [ ] T506: `lib/policies/web-runtime-policy.ts`（DynamoDB アクセスポリシー）
- [ ] T507: `lib/iam-stack.ts`
- [ ] T508: `lib/lambda-stack.ts`（Web Lambda Function URL）
- [ ] T509: `lib/cloudfront-stack.ts`（カスタムドメイン設定）
- [ ] T510: `lib/share-together-stack.ts`（全スタックのオーケストレーション）
- [ ] T511: `infra/share-together/` の `package.json` をモノレポに追加（`@nagiyu/infra-share-together`）

### フェーズ 6: CI/CD 設定

- [ ] T601: `.github/workflows/share-together-verify-fast.yml` 作成
- [ ] T602: `.github/workflows/share-together-verify-full.yml` 作成
- [ ] T603: `.github/workflows/share-together-deploy.yml` 作成
- [ ] T604: Dockerfile（`services/share-together/web/Dockerfile`）を stock-tracker を参考に作成

### フェーズ 7: テスト・品質保証

- [ ] T701: E2E テスト: 認証フロー（未認証リダイレクト・ログイン・ログアウト）
- [ ] T702: E2E テスト: 個人 ToDo リスト CRUD（ユーザーストーリー 1, 2）
- [ ] T703: E2E テスト: グループ作成・招待・承認・脱退（ユーザーストーリー 3）
- [ ] T704: E2E テスト: グループ共有 ToDo リスト CRUD（ユーザーストーリー 4）
- [ ] T705: E2E テスト: アクセス制御検証（非メンバーによるグループリストアクセス）
- [ ] T706: E2E テスト: モバイルビューポートでの動作確認（Playwright chromium-mobile）
- [ ] T707: アクセシビリティテスト（@axe-core/playwright を使用）

---

## テスト戦略

### ユニットテスト（core）

- フレームワーク: Jest
- 対象: `core/src/` 配下の全ビジネスロジック
- モック戦略: インメモリリポジトリを使用（DynamoDB モック不要）
- カバレッジ目標: 80% 以上（ビジネスロジック重点）
- 実行コマンド: `npm run test --workspace @nagiyu/share-together-core`

### E2E テスト（web）

- フレームワーク: Playwright
- 対象: `specs/001-share-together/spec.md` の受け入れシナリオ全件
- 高速検証: chromium-mobile のみ（fast ワークフロー）
- 完全検証: chromium, firefox, webkit, chromium-mobile（full ワークフロー）
- テスト実行に必要な認証情報: AWS Secrets Manager から取得（`nagiyu-share-together-credentials-dev`）
- 実行コマンド: `npm run test:e2e --workspace @nagiyu/share-together-web`

### テストシナリオ優先度

| 優先度 | テスト内容 |
|---|---|
| P1 | 認証フロー（未認証リダイレクト、SSO） |
| P1 | 個人 ToDo リストの CRUD 操作 |
| P1 | グループ共有 ToDo リストの CRUD 操作 |
| P2 | グループ作成・招待・承認フロー |
| P2 | 複数個人リストの作成・切り替え |
| P2 | アクセス制御（非メンバー・非オーナー） |

---

## 受け入れ基準

以下のすべてを満たした時点で MVP 完了とする。

### 機能

- [ ] AC-001: 未認証ユーザーが `/` にアクセスすると Auth サービスのログインページにリダイレクトされる
- [ ] AC-002: ログイン後にトップページ（デフォルト個人 ToDo リスト）が表示される
- [ ] AC-003: 個人 ToDo リストで ToDo の作成・完了・編集・削除ができる
- [ ] AC-004: 個人 ToDo リストを追加作成・切り替え・削除ができる（デフォルトは削除不可）
- [ ] AC-005: グループを作成し、他ユーザーを招待できる
- [ ] AC-006: 招待されたユーザーが承認するとグループメンバーになる
- [ ] AC-007: グループ共有 ToDo リストを作成し、メンバー間で ToDo を共有できる
- [ ] AC-008: グループ非メンバーがグループリストの URL に直接アクセスすると 403 または別ページにリダイレクトされる
- [ ] AC-009: ログアウトが正常に動作し、以降のアクセスで再ログインが要求される

### 技術品質

- [ ] AC-101: core パッケージのテストカバレッジ 80% 以上
- [ ] AC-102: 全 E2E テスト（chromium-mobile）がパスする
- [ ] AC-103: lint・format チェックがパスする
- [ ] AC-104: TypeScript のビルドエラーなし
- [ ] AC-105: Docker イメージのビルドが成功する
- [ ] AC-106: CDK synth がエラーなし

### インフラ・デプロイ

- [ ] AC-201: dev 環境へのデプロイが成功する
- [ ] AC-202: `GET /api/health` が 200 を返す
- [ ] AC-203: `https://dev-share-together.nagiyu.com` でサービスにアクセスできる
- [ ] AC-204: PWA として「ホーム画面に追加」が機能する（manifest.json, SW 登録）

---

## 備考・未決定事項

### 招待時のユーザー特定方法

グループ招待は、オーナーが招待したいユーザーの UserID またはメールアドレスを**事前に知っていること**を前提とする。

ユーザー一覧・検索エンドポイントは提供しない。これはプラットフォームにアクセスできるユーザーを第三者が把握できてしまうことを防ぐためである。

**招待フロー**:
1. オーナーがグループ設定画面の招待フォームに、相手の UserID またはメールアドレスを直接入力する
2. `POST /api/groups/{groupId}/members` に `{ userId }` または `{ email }` を送信する
3. API は Share Together の User テーブルを検索し、一致するレコードが存在する場合のみ招待を作成する
4. 一致するレコードが存在しない場合は 404 を返し、「指定されたユーザーが見つかりません」と表示する

### 招待通知

MVP では「次回ページアクセス時にサービス内通知を表示」とする。ヘッダーに未処理招待件数バッジを表示し、クリックで `/invitations` ページへ遷移する実装を想定。

### グループオーナーの移譲

MVP スコープ外。オーナーがグループを削除したい場合は、グループ削除操作のみを提供する。

### DynamoDB の Todo Item PK 設計について

TodoItem の PK を `LIST#{listId}` とすることで、個人リストとグループ共有リストで同一の Todo テーブル構造を使用できる。listId は UUID で生成するため衝突しない。

### VAPID キーの生成

将来のプッシュ通知に備えて、インフラデプロイ時に VAPID キーペアを `web-push` ライブラリで生成し、Secrets Manager に保存する手順をデプロイワークフローに含める（stock-tracker の実装を参照）。MVP では Lambda の環境変数への注入はスキップしても可。
