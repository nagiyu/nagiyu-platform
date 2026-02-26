# タスク: みんなでシェアリスト (Share Together)

**入力**: `/specs/001-share-together/` の設計ドキュメント
**前提条件**: [plan.md](./plan.md)、[spec.md](./spec.md)、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/api.md](./contracts/api.md)

**テスト**: `core` のビジネスロジック（`src/libs/`）のユニットテストは必須（MUST、80% カバレッジ）。
E2E テストは `web` サービスに必須（MUST）。UI 層のユニットテストは E2E でカバーされる場合は省略可。

**整理方法**: フェーズ1〜3（骨組み・インフラ・UI）を先行し、フェーズ5以降でユーザーストーリー単位の実装を行う。

## フォーマット: `[ID] [P?] [Story?] 説明`

- **[P]**: 並列実行可能（異なるファイル、依存関係なし）
- **[Story]**: 対応するユーザーストーリー（US1〜US5）
- 説明には正確なファイルパスを含めること

---

## フェーズ1: セットアップ（core/web 骨組み + Verify CI）

**目的**: プロジェクト初期化・設定ファイル・CI ワークフロー作成。CI でコード品質を保ち続けるための基盤。

- [ ] T001 `services/share-together/core/` パッケージを作成（`package.json` @nagiyu/share-together-core、build/test/lint/format スクリプト）
- [ ] T002 [P] `services/share-together/core/tsconfig.json` を作成（`configs/tsconfig.base.json` 継承）
- [ ] T003 [P] `services/share-together/core/eslint.config.mjs` を作成（`configs/eslint.config.base.mjs` 継承）
- [ ] T004 [P] `services/share-together/core/jest.config.ts` を作成（`configs/jest.config.base.ts` 継承、coverageThreshold 80%）
- [ ] T005 [P] `services/share-together/core/src/index.ts` にプレースホルダーを作成
- [ ] T006 `services/share-together/web/` パッケージを作成（`package.json` @nagiyu/share-together-web、dev/build/lint/format/test:e2e スクリプト）
- [ ] T007 [P] `services/share-together/web/tsconfig.json` を作成（`configs/tsconfig.base.json` 継承）
- [ ] T008 [P] `services/share-together/web/eslint.config.mjs` を作成（`configs/eslint.config.base.mjs` 継承）
- [ ] T009 [P] `services/share-together/web/jest.config.ts` を作成（`configs/jest.config.base.ts` 継承）
- [ ] T010 [P] `services/share-together/web/playwright.config.ts` を作成（chromium-desktop / chromium-mobile / webkit-mobile）
- [ ] T011 [P] `services/share-together/web/next.config.ts` を作成（standalone 出力、`@nagiyu/share-together-core` トランスパイル設定）
- [ ] T012 [P] `services/share-together/web/Dockerfile` を作成（他サービスの Dockerfile を参考にしたマルチステージビルド）
- [ ] T013 `services/share-together/web/src/app/layout.tsx` にプレースホルダーを作成（実装はフェーズ4）
- [ ] T014 `services/share-together/web/src/app/page.tsx` にプレースホルダーを作成（実装はフェーズ4）
- [ ] T015 `.github/workflows/share-together-web-verify-fast.yml` を作成（`integration/**` への PR でトリガー、lint / format-check / build-core / build-web / docker-build / test-core / e2e-test chromium-mobile のみ / synth-infra）
- [ ] T016 `.github/workflows/share-together-web-verify-full.yml` を作成（`develop` への PR でトリガー、Fast CI の全ジョブ + カバレッジ 80% チェック + E2E 全デバイス）

**チェックポイント**: プロジェクト骨格と CI が完成し、空の状態でも CI が通ること

---

## フェーズ2: 基盤構築（必須前提条件）

**目的**: すべてのユーザーストーリー実装前に完了が必要なコアインフラ

**⚠️ 重要**: このフェーズが完了するまでユーザーストーリーの実装を開始してはならない

- [ ] T017 `services/share-together/core/src/types/index.ts` にコア共通型定義を作成（User、PersonalList、Group、GroupMembership、GroupList、TodoItem の型）
- [ ] T018 [P] `services/share-together/web/src/types/index.ts` に Web 層の型定義を作成（API レスポンス型、セッション拡張型）
- [ ] T019 [P] `services/share-together/web/src/lib/constants/errors.ts` にエラーメッセージ定数（`ERROR_MESSAGES`）を定義（日本語で記述）
- [ ] T020 [P] `services/share-together/core/src/repositories/user/user-repository.interface.ts` にユーザーリポジトリインターフェイスを作成
- [ ] T021 [P] `services/share-together/core/src/repositories/list/list-repository.interface.ts` に個人リストリポジトリインターフェイスを作成
- [ ] T022 [P] `services/share-together/core/src/repositories/todo/todo-repository.interface.ts` に ToDo リポジトリインターフェイスを作成
- [ ] T023 [P] `services/share-together/core/src/repositories/group/group-repository.interface.ts` にグループリポジトリインターフェイスを作成
- [ ] T024 [P] `services/share-together/core/src/repositories/membership/membership-repository.interface.ts` にメンバーシップリポジトリインターフェイスを作成
- [ ] T025 `services/share-together/web/auth.ts` に NextAuth v5 の Auth Consumer パターンを実装（既存サービスの `auth.ts` を参考、`providers: []`、`session.strategy: 'jwt'`、Cookie 名は環境別）
- [ ] T026 [P] `services/share-together/web/src/lib/aws-clients.ts` に DynamoDB クライアントを設定
- [ ] T027 [P] `services/share-together/web/src/lib/auth/session.ts` にセッション取得ユーティリティを実装（未認証時は 401 を返すヘルパー）
- [ ] T028 `services/share-together/web/src/app/api/health/route.ts` にヘルスチェック API を実装（GET `/api/health`、認証不要、`{"data":{"status":"ok"}}` を返す）
- [ ] T029 [P] `services/share-together/web/public/manifest.json` に PWA マニフェストを作成（アプリ名・アイコン・`display: standalone`）
- [ ] T030 [P] `services/share-together/web/public/sw.js` に Service Worker シェルを作成（キャッシュ戦略のみ、プッシュ通知コードはコメントアウト）
- [ ] T031 [P] `services/share-together/web/src/components/ServiceWorkerRegistration.tsx` に Service Worker 登録コンポーネントを作成

**チェックポイント**: 基盤完了 - ユーザーストーリーの実装を並行して開始可能

---

## フェーズ3: インフラ構築 + Deploy CI

**目的**: デプロイ先で動作確認できるようにするための AWS インフラと Deploy CI

- [ ] T032 `infra/share-together/` パッケージを作成（`package.json` @nagiyu/infra-share-together、build/synth スクリプト、`tsconfig.json`、`cdk.json`）
- [ ] T033 [P] `infra/share-together/lib/dynamodb-stack.ts` に DynamoDB スタックを実装（テーブル名 `nagiyu-share-together-main-{env}`、PK/SK + GSI1/GSI2、PAY_PER_REQUEST、PITR、TTL 属性 `TTL`）
- [ ] T034 [P] `infra/share-together/lib/ecr-stack.ts` に ECR スタックを実装（Web コンテナリポジトリ）
- [ ] T035 [P] `infra/share-together/lib/policies/web-runtime-policy.ts` に Lambda 実行ポリシーを実装（DynamoDB テーブルへの読み書き権限）
- [ ] T036 `infra/share-together/lib/lambda-stack.ts` に Lambda スタックを実装（コンテナイメージ、環境変数設定、ECR リポジトリ参照）
- [ ] T037 `infra/share-together/lib/iam-stack.ts` に IAM スタックを実装（開発用ユーザー、dev 環境のみ）
- [ ] T038 `infra/share-together/lib/cloudfront-stack.ts` に CloudFront スタックを実装（`@nagiyu/infra-common` の `CloudFrontStackBase` 継承、ドメイン `dev-share-together.nagiyu.com` / `share-together.nagiyu.com`）
- [ ] T039 `infra/share-together/bin/share-together.ts` に CDK アプリエントリポイントを作成（全スタックのインスタンス化、`dev`/`prod` 環境切り替え）
- [ ] T040 `.github/workflows/share-together-deploy.yml` を Deploy CI ワークフローとして作成（`develop`/`master` へのプッシュ時または手動トリガー、ECR プッシュ + CDK デプロイ）

**チェックポイント**: dev 環境への CDK デプロイが可能な状態

---

## フェーズ4: UI 整備（モック）

**目的**: モックデータで全画面の UI を先行実装し、UI 設計を確定する

- [ ] T041 `services/share-together/web/src/components/ThemeRegistry.tsx` に MUI テーマプロバイダーを実装（他サービスのパターンを参考）
- [ ] T042 `services/share-together/web/src/app/layout.tsx` にルートレイアウトを実装（ThemeRegistry、ServiceWorkerRegistration、manifest.json リンク）
- [ ] T043 `services/share-together/web/src/components/Navigation.tsx` にナビゲーションバーをモックで実装（招待バッジプレースホルダー含む）
- [ ] T044 [P] [US1] `services/share-together/web/src/components/TodoItem.tsx` に ToDo アイテムコンポーネントをモックで実装（タイトル表示・完了チェックボックス・削除ボタン）
- [ ] T045 [P] [US1] `services/share-together/web/src/components/TodoForm.tsx` に ToDo 追加フォームをモックで実装（タイトル入力・送信ボタン）
- [ ] T046 [P] [US1] `services/share-together/web/src/components/TodoList.tsx` に ToDo リストコンポーネントをモックで実装（TodoItem・TodoForm を組み合わせ、モックデータ使用）
- [ ] T047 [P] [US1] `services/share-together/web/src/app/page.tsx` にトップページをモックで実装（デフォルト個人リストの TodoList 表示、モックデータ使用）
- [ ] T048 [P] [US2] `services/share-together/web/src/components/ListSidebar.tsx` にリストサイドバーをモックで実装（個人リスト一覧・作成ボタン・切り替え）
- [ ] T049 [P] [US2] `services/share-together/web/src/app/lists/[listId]/page.tsx` に個人リスト詳細ページをモックで実装（ListSidebar + TodoList、モックデータ使用）
- [ ] T050 [P] [US3] `services/share-together/web/src/components/GroupCard.tsx` にグループカードコンポーネントをモックで実装（グループ名・メンバー数・リンク）
- [ ] T051 [P] [US3] `services/share-together/web/src/components/InvitationBadge.tsx` に招待バッジコンポーネントをモックで実装（未処理招待数バッジ）
- [ ] T052 [P] [US3] `services/share-together/web/src/app/groups/page.tsx` にグループ一覧ページをモックで実装（GroupCard 一覧、グループ作成ボタン）
- [ ] T053 [P] [US3] `services/share-together/web/src/app/groups/[groupId]/page.tsx` にグループ詳細ページをモックで実装（メンバー一覧・共有リスト一覧・メンバー招待フォーム）
- [ ] T054 [P] [US3] `services/share-together/web/src/app/invitations/page.tsx` に招待一覧ページをモックで実装（招待カード・承認/拒否ボタン）
- [ ] T055 [P] [US4] `services/share-together/web/src/app/groups/[groupId]/lists/[listId]/page.tsx` にグループ共有リスト詳細ページをモックで実装（共有 TodoList + 更新ボタン）

**チェックポイント**: 全ページのモック UI が表示可能で、UI 設計の確認・議論ができる状態

---

## フェーズ5: ユーザーストーリー5 - 認証・ログイン (優先度: P1) 🎯 認証基盤

**目標**: 未ログインユーザーが Auth サービス経由でシームレスにログインし、認証後にサービスを利用できる

**独立したテスト**: 未認証状態でサービスにアクセスし、Auth サービスへのリダイレクト・認証後の戻り・ログアウト操作を検証できる

### ユーザーストーリー5のテスト

- [ ] T056 [P] [US5] `services/share-together/web/tests/e2e/auth.spec.ts` に E2E テストを作成（未認証リダイレクト・ログイン後の遷移・ログアウト）

### ユーザーストーリー5の実装

- [ ] T057 [US5] `services/share-together/web/src/app/api/auth/[...nextauth]/route.ts` に NextAuth ルートを実装
- [ ] T058 [US5] `services/share-together/web/src/app/api/users/route.ts` にユーザー登録 API（POST `/api/users`）を実装（初回ログイン時のユーザー作成とデフォルトリスト自動生成）
- [ ] T059 [P] [US5] `services/share-together/core/src/repositories/user/in-memory-user-repository.ts` にインメモリユーザーリポジトリを実装（テスト用）
- [ ] T060 [P] [US5] `services/share-together/core/src/repositories/user/dynamodb-user-repository.ts` に DynamoDB ユーザーリポジトリを実装（GetItem / Query GSI2）
- [ ] T061 [US5] 未認証ユーザーの全ページへのアクセスを Auth サービスへリダイレクトするミドルウェアを実装（`services/share-together/web/src/middleware.ts`）
- [ ] T062 [US5] 初回ログイン後のユーザー登録自動呼び出しを実装（NextAuth v5 の `signIn` コールバックで POST `/api/users` を実行するか、`services/share-together/web/src/app/page.tsx` で初回アクセス時に自動実行する）

**チェックポイント**: 認証フローが動作し、E2E テストでリダイレクト・ログイン・ログアウトが確認できる状態

---

## フェーズ6: ユーザーストーリー1 - 個人 ToDo リストの管理 (優先度: P1) 🎯 MVP

**目標**: 認証済みユーザーがデフォルトの個人 ToDo リストで ToDo の追加・編集・削除・完了ができる

**独立したテスト**: 認証済みユーザー 1 名のみで、グループ機能を使わずに ToDo の CRUD 操作をすべて検証できる

### ユーザーストーリー1のテスト

- [ ] T063 [P] [US1] `services/share-together/core/tests/unit/libs/todo.test.ts` にビジネスロジックのユニットテストを作成（MUST: 80% カバレッジ、AAA パターン）
- [ ] T064 [P] [US1] `services/share-together/core/tests/unit/libs/list.test.ts` にリスト操作ロジックのユニットテストを作成
- [ ] T065 [P] [US1] `services/share-together/web/tests/e2e/personal-todo.spec.ts` に E2E テストを作成（ToDo 追加・完了・編集・削除のシナリオ）

### ユーザーストーリー1の実装

- [ ] T066 [P] [US1] `services/share-together/core/src/repositories/list/in-memory-list-repository.ts` にインメモリ個人リストリポジトリを実装
- [ ] T067 [P] [US1] `services/share-together/core/src/repositories/list/dynamodb-list-repository.ts` に DynamoDB 個人リストリポジトリを実装（Query: `PK=USER#{userId}`, `SK begins_with PLIST#`）
- [ ] T068 [P] [US1] `services/share-together/core/src/repositories/todo/in-memory-todo-repository.ts` にインメモリ ToDo リポジトリを実装
- [ ] T069 [P] [US1] `services/share-together/core/src/repositories/todo/dynamodb-todo-repository.ts` に DynamoDB ToDo リポジトリを実装（Query: `PK=LIST#{listId}`, `SK begins_with TODO#`）
- [ ] T070 [US1] `services/share-together/core/src/libs/todo.ts` に ToDo 操作のビジネスロジックを実装（バリデーション・CRUD・エラーハンドリング）
- [ ] T071 [US1] `services/share-together/core/src/libs/list.ts` に個人リスト操作のビジネスロジックを実装（デフォルトリスト削除禁止ロジック含む）
- [ ] T072 [P] [US1] `services/share-together/web/src/app/api/lists/route.ts` に個人リスト一覧取得・作成 API（GET/POST `/api/lists`）を実装
- [ ] T073 [P] [US1] `services/share-together/web/src/app/api/lists/[listId]/todos/route.ts` に ToDo 一覧取得・作成 API（GET/POST `/api/lists/[listId]/todos`）を実装
- [ ] T074 [P] [US1] `services/share-together/web/src/app/api/lists/[listId]/todos/[todoId]/route.ts` に ToDo 更新・削除 API（PUT/DELETE）を実装
- [ ] T075 [US1] `services/share-together/web/src/app/page.tsx` のトップページをモックから実際の API 呼び出しに切り替える

**チェックポイント**: ユーザーストーリー1が独立して機能・テスト可能な状態（MVP 達成）

---

## フェーズ7: ユーザーストーリー2 - 複数の個人 ToDo リストの作成と切り替え (優先度: P2)

**目標**: 用途ごとに複数の個人 ToDo リストを作成・切り替え・削除できる

**独立したテスト**: 認証済みユーザー 1 名のみで、複数のリスト作成・切り替え・削除をグループ機能を使わずに検証できる

### ユーザーストーリー2のテスト

- [ ] T076 [P] [US2] `services/share-together/core/tests/unit/libs/list.test.ts` に複数リスト管理のユニットテストを追加（上限 100 件・デフォルト削除禁止・命名バリデーション）
- [ ] T077 [P] [US2] `services/share-together/web/tests/e2e/personal-lists.spec.ts` に E2E テストを作成（リスト作成・切り替え・名称変更・削除・デフォルト削除拒否のシナリオ）

### ユーザーストーリー2の実装

- [ ] T078 [P] [US2] `services/share-together/web/src/app/api/lists/[listId]/route.ts` に個人リスト取得・更新・削除 API（GET/PUT/DELETE `/api/lists/[listId]`）を実装（デフォルト削除時は `DEFAULT_LIST_NOT_DELETABLE` エラー）
- [ ] T079 [US2] `services/share-together/web/src/app/lists/[listId]/page.tsx` の個人リスト詳細ページをモックから実際の API 呼び出しに切り替える
- [ ] T080 [US2] `services/share-together/web/src/components/ListSidebar.tsx` のリストサイドバーをモックから実際の API 呼び出しに切り替える（リスト作成・名称変更・削除の操作 UI）

**チェックポイント**: ユーザーストーリー1と2が独立して機能する状態

---

## フェーズ8: ユーザーストーリー3 - グループの作成とメンバー管理 (優先度: P2)

**目標**: 他のユーザーを招待してグループを作成し、グループメンバーを管理できる

**独立したテスト**: 認証済みユーザー 2 名以上で、グループ作成・招待・参加・脱退のフローを検証できる

### ユーザーストーリー3のテスト

- [ ] T081 [P] [US3] `services/share-together/core/tests/unit/libs/group.test.ts` にグループ操作ロジックのユニットテストを作成（メンバー上限 5 名・オーナー脱退禁止・招待重複禁止・カスケード削除）
- [ ] T082 [P] [US3] `services/share-together/web/tests/e2e/group-management.spec.ts` に E2E テストを作成（グループ作成・招待送信・招待承認/拒否・脱退・オーナーによる除外のシナリオ）

### ユーザーストーリー3の実装

- [ ] T083 [P] [US3] `services/share-together/core/src/repositories/group/in-memory-group-repository.ts` にインメモリグループリポジトリを実装
- [ ] T084 [P] [US3] `services/share-together/core/src/repositories/group/dynamodb-group-repository.ts` に DynamoDB グループリポジトリを実装（GetItem: `PK=GROUP#{groupId}`, `SK=#META#`）
- [ ] T085 [P] [US3] `services/share-together/core/src/repositories/membership/in-memory-membership-repository.ts` にインメモリメンバーシップリポジトリを実装
- [ ] T086 [P] [US3] `services/share-together/core/src/repositories/membership/dynamodb-membership-repository.ts` に DynamoDB メンバーシップリポジトリを実装（Query GSI1: `GSI1PK=USER#{userId}`、TTL 設定）
- [ ] T087 [US3] `services/share-together/core/src/libs/group.ts` にグループ操作のビジネスロジックを実装（作成・招待・承認/拒否・脱退・除外・削除カスケード、メンバー上限 5 名・招待 TTL 86400 秒）
- [ ] T088 [P] [US3] `services/share-together/web/src/app/api/groups/route.ts` にグループ一覧取得・作成 API（GET/POST `/api/groups`）を実装
- [ ] T089 [P] [US3] `services/share-together/web/src/app/api/groups/[groupId]/route.ts` にグループ更新・削除 API（PUT/DELETE）を実装（オーナー権限チェック）
- [ ] T090 [P] [US3] `services/share-together/web/src/app/api/groups/[groupId]/members/route.ts` にグループメンバー一覧取得・招待 API（GET/POST）を実装
- [ ] T091 [P] [US3] `services/share-together/web/src/app/api/groups/[groupId]/members/[userId]/route.ts` にメンバー除外・脱退 API（DELETE）を実装
- [ ] T092 [P] [US3] `services/share-together/web/src/app/api/invitations/route.ts` に保留中招待一覧取得 API（GET `/api/invitations`）を実装（GSI1 + BatchGet でグループ名・招待者名を取得）
- [ ] T093 [US3] `services/share-together/web/src/app/api/invitations/[groupId]/route.ts` に招待承認/拒否 API（PUT `/api/invitations/[groupId]`）を実装（ACCEPT/REJECT、TTL クリア）
- [ ] T094 [US3] グループ一覧・グループ詳細・招待一覧ページをモックから実際の API 呼び出しに切り替える（`groups/page.tsx`、`groups/[groupId]/page.tsx`、`invitations/page.tsx`）
- [ ] T095 [US3] `services/share-together/web/src/components/InvitationBadge.tsx` の招待バッジをモックから実際の `/api/invitations` 呼び出しに切り替える

**チェックポイント**: ユーザーストーリー3が独立して機能・テスト可能な状態

---

## フェーズ9: ユーザーストーリー4 - グループ共有 ToDo リストの管理 (優先度: P1)

**目標**: グループメンバー全員が共有 ToDo リストを閲覧・追加・編集・削除でき、ページ更新で最新状態を確認できる

**独立したテスト**: 認証済みユーザー 2 名以上が同じグループに参加した状態で、ToDo の CRUD を各メンバーが操作して検証できる

> **前提**: フェーズ8（US3 グループ管理）の完了が必要

### ユーザーストーリー4のテスト

- [ ] T096 [P] [US4] `services/share-together/web/tests/e2e/group-shared-todo.spec.ts` に E2E テストを作成（共有リスト作成・ToDo 追加・他メンバーの変更確認・非メンバーのアクセス拒否のシナリオ）

### ユーザーストーリー4の実装

- [ ] T097 [P] [US4] `services/share-together/core/src/repositories/list/dynamodb-list-repository.ts` にグループ共有リストの CRUD を追加（Query: `PK=GROUP#{groupId}`, `SK begins_with GLIST#`）
- [ ] T098 [P] [US4] `services/share-together/web/src/app/api/groups/[groupId]/lists/route.ts` にグループ共有リスト一覧取得・作成 API（GET/POST）を実装（グループメンバー権限チェック）
- [ ] T099 [P] [US4] `services/share-together/web/src/app/api/groups/[groupId]/lists/[listId]/route.ts` に共有リスト更新・削除 API（PUT/DELETE）を実装（カスケード削除含む）
- [ ] T100 [P] [US4] `services/share-together/web/src/app/api/groups/[groupId]/lists/[listId]/todos/route.ts` に共有リスト内 ToDo 一覧取得・作成 API（GET/POST）を実装（グループメンバー権限チェック）
- [ ] T101 [P] [US4] `services/share-together/web/src/app/api/groups/[groupId]/lists/[listId]/todos/[todoId]/route.ts` に共有 ToDo 更新・削除 API（PUT/DELETE）を実装
- [ ] T102 [US4] `services/share-together/web/src/app/groups/[groupId]/lists/[listId]/page.tsx` のグループ共有リスト詳細ページをモックから実際の API 呼び出しに切り替える（更新ボタン付き）
- [ ] T103 [US4] グループ詳細ページ（`groups/[groupId]/page.tsx`）に共有リスト一覧と作成フォームを実際の API で表示

**チェックポイント**: すべてのユーザーストーリーが独立して機能・テスト可能な状態

---

## フェーズ10: 品質向上・横断的関心事

**目的**: 複数のユーザーストーリーに影響する改善・最終確認

- [ ] T104 [P] 全 API エンドポイントの認証チェック（未認証の場合は 401）と権限チェック（403）を確認・修正する
- [ ] T105 [P] `services/share-together/core` の lint・format-check の通過確認
- [ ] T106 [P] `services/share-together/web` の lint・format-check の通過確認
- [ ] T107 `services/share-together/core` のテストカバレッジ 80% 以上の確認（`npm run test:coverage --workspace @nagiyu/share-together-core`）
- [ ] T108 E2E テストのフル実行確認（chromium-desktop、chromium-mobile、webkit-mobile）
- [ ] T109 [P] `services/share-together/web/.env.example` を作成（必要な環境変数のテンプレート）
- [ ] T110 [P] `docs/services/share-together/` にサービスドキュメントを作成（README、アーキテクチャ概要）

---

## 依存関係と実行順序

### フェーズ依存関係

- **フェーズ1（セットアップ）**: 依存なし - 即座に開始可能
- **フェーズ2（基盤構築）**: フェーズ1完了後 - フェーズ5〜9をブロック
- **フェーズ3（インフラ）**: フェーズ1完了後 - フェーズ2と並行作業可能
- **フェーズ4（UI モック）**: フェーズ2完了後 - フェーズ5〜9の UI 実装を先行
- **フェーズ5（US5 認証）**: フェーズ2完了後 - フェーズ6〜9をブロック
- **フェーズ6（US1）**: フェーズ5完了後
- **フェーズ7（US2）**: フェーズ6完了後（US1 の拡張）
- **フェーズ8（US3）**: フェーズ5完了後（フェーズ6と並行可）
- **フェーズ9（US4）**: **フェーズ8完了後**（US3 グループ機能が必須前提）
- **フェーズ10（品質向上）**: フェーズ5〜9完了後

### ユーザーストーリー間の依存関係

```
US5（認証）
  ├─→ US1（個人 ToDo）
  │     └─→ US2（複数個人リスト）
  └─→ US3（グループ管理）
        └─→ US4（グループ共有 ToDo）[P1 だが US3 が必須前提]
```

### 並列実行の機会

- `[P]` タグが付いたタスクは並列実行可能
- フェーズ2とフェーズ3は並行作業可能（インフラと基盤コードの分担）
- フェーズ6（US1）とフェーズ8（US3）は認証基盤完了後に並行作業可能
- 各フェーズ内の `[P]` タスクはすべて並列実行可能

---

## 実装戦略

### MVP ファースト（フェーズ1〜6）

1. フェーズ1: プロジェクト骨格と CI を完成させる
2. フェーズ2: 基盤コードを完成させる（重要 - すべてのストーリーをブロック）
3. フェーズ3: インフラを構築し dev 環境にデプロイできる状態にする（フェーズ2と並行可）
4. フェーズ4: モック UI で全画面の設計を確認する
5. フェーズ5: 認証フローを実装する
6. フェーズ6: US1（個人 ToDo 管理）を実装する
7. **停止して検証**: ログイン → デフォルトリストで ToDo CRUD ができる状態を確認
8. 準備ができれば dev 環境でデモ（**MVP 達成**）

### インクリメンタルデリバリー

1. フェーズ1〜3 → 骨格・インフラ完成
2. フェーズ4 → UI 設計確定
3. フェーズ5〜6 → MVP デリバリー（個人 ToDo 管理）
4. フェーズ7 → 複数リスト対応
5. フェーズ8〜9 → グループ機能デリバリー（サービスの中心価値）

---

## 注記

- `[P]` タスク = 異なるファイル、依存関係なし、並列実行可能
- `[Story]` ラベルはトレーサビリティのためにタスクを特定のユーザーストーリーにマップ
- 各ユーザーストーリーは独立して完了・テスト可能であること
- 実装前にユニットテストが FAIL することを確認すること（TDD）
- 各タスクまたは論理グループ後にコミットすること
- US4 は P1 だが US3（P2）が必須前提のため、US3 完了後に着手すること
