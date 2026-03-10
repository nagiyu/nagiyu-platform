# Share Together E2E の充実計画

## 概要

`specs/001-share-together/spec.md` で定義された機能要件に対し、Share Together の E2E テストカバレッジを向上させる。
認証系（実 OAuth フロー）は E2E での検証が困難なため除外し、それ以外の機能については
`USE_IN_MEMORY_DB=true` + `SKIP_AUTH_CHECK=true` によるインメモリ DB 起動方式で統一して検証する。

本ドキュメントは現状分析と充実計画をまとめ、以降の実装タスクの基盤とする。

## 関連情報

- Issue: E2E の充実
- タスクタイプ: サービスタスク（Share Together）
- 主要ドキュメント:
    - `specs/001-share-together/spec.md` - Share Together 機能要件
    - `docs/development/testing.md` - テスト戦略（E2E 方針・CI 戦略）
    - `docs/services/share-together/testing.md` - Share Together テスト仕様
    - `services/niconico-mylist-assistant/web/.env.test` - niconico E2E 環境変数（参考）
    - `services/niconico-mylist-assistant/core/src/repositories/factory.ts` - ファクトリパターン（参考）

---

## 現状分析

### E2E テストの実装状況（`services/share-together/web/tests/e2e/`）

| ファイル | 対応要件 | 状態 |
| --- | --- | --- |
| `personal-todo.spec.ts` | FR-008 個人 ToDo の CRUD | **部分実装**（編集が `test.fixme`）、`page.route()` モック方式 |
| `personal-lists.spec.ts` | FR-005〜007 個人リスト管理 | 実装済み（一部エッジケースなし）、`page.route()` モック方式 |
| `group-management.spec.ts` | FR-010〜014 グループ管理 | 実装済み（FR-015・FR-022〜024 なし）、`page.route()` モック方式 |
| `group-shared-todo.spec.ts` | FR-017〜020 グループ共有 ToDo | **部分実装**（ToDo の完了・編集・削除が未実装）、`page.route()` モック方式 |

既存の E2E テストはすべて `page.route()` モック方式で実装されている。
インメモリ DB 起動方式への移行が必要（T000f）。

### インメモリリポジトリの実装状況

Share Together のインメモリリポジトリ（Group, User, Membership, Todo, List）はすべて実装済みだが、
現時点ではユニットテストのみで活用されており、E2E での利用は未実施。

---

## 機能要件と E2E カバレッジのギャップ

specs の機能要件と照合したギャップを以下に示す。

| 要件 ID | 内容 | E2E カバレッジ状況 |
| --- | --- | --- |
| FR-004 | 初回ログイン時のデフォルトリスト自動生成 | ❌ 未カバー |
| FR-005 | 個人リスト上限 100 件 | ❌ 未カバー |
| FR-007 | デフォルトリスト削除禁止 | △ UI の無効化確認のみ（API エラー検証なし） |
| FR-008 | ToDo の編集 | ❌ `test.fixme` |
| FR-015 | グループ削除（オーナーのみ） | ❌ 未カバー |
| FR-022 | グループ名変更（オーナーのみ） | ❌ 未カバー |
| FR-023 | グループ最大メンバー数 5 名 | ❌ 未カバー |
| FR-024 | 招待の 1 日自動失効 | ❌ 時間経過を伴うためテスト困難（スキップ方針） |
| FR-019 | グループ共有 ToDo の完了・編集・削除 | ❌ 未カバー（追加のみ実装済み） |
| FR-021 | グループ共有リストの名称変更・削除 | ❌ 未カバー |
| SC-004 | 非メンバーの個人リストへのアクセス拒否 | △ グループのみ検証・個人リストは未検証 |
| エッジケース | 重複招待の防止 | ❌ 未カバー |
| エッジケース | グループオーナーがグループから脱退不可 | ❌ 未カバー |

---

## E2E テスト戦略

### 採用方式: インメモリ DB 起動方式

niconico-mylist-assistant が採用している方式を Share Together に導入し、全 E2E テストで統一する。

- `USE_IN_MEMORY_DB=true` 環境変数でアプリを起動し、API ルートがインメモリリポジトリを使用するよう切り替える
- `SKIP_AUTH_CHECK=true` で認証をバイパスし、`TEST_USER_ID` 等の環境変数で固定テストユーザーを使用する
- テストデータは `/api/test/reset` を `beforeEach` で呼び出してクリーンアップし、テスト間の独立性を確保する
- 実際の API ルートとビジネスロジックを通した検証ができる

### 認証系テストの扱い方針

| テスト対象 | 方針 |
| --- | --- |
| Google OAuth フロー | **E2E 対象外**（外部サービス依存・CI 環境での安定実行が困難） |
| 未認証リダイレクト | **E2E 対象外**（`SKIP_AUTH_CHECK=true` 環境では検証不可）、middleware のユニットテストでカバー |
| ロールベースアクセス制御（RBAC） | **E2E で検証**（`TEST_USER_ID` / `TEST_USER_ROLES` でユーザーを切り替えて検証） |

---

## タスクリスト

**【前提】インメモリ DB 起動方式の基盤整備**

- [x] T000a: `services/share-together/core/` にリポジトリファクトリを追加する
    - niconico の `factory.ts` を参考に、`USE_IN_MEMORY_DB=true` の場合にインメモリリポジトリを返す
      ファクトリ関数（`createListRepository`, `createTodoRepository`, `createGroupRepository` 等）を実装する
    - すべてのエンティティ（List, Todo, Group, User, Membership）のファクトリを追加する
- [x] T000b: `services/share-together/web/src/lib/auth/session.ts` に `SKIP_AUTH_CHECK` 対応を追加する
    - `SKIP_AUTH_CHECK=true` の場合、`TEST_USER_ID` / `TEST_USER_EMAIL` / `TEST_USER_NAME` 環境変数から
      固定セッションを返すよう `getSessionOrUnauthorized` を更新する（niconico の `getSession` 相当）
- [x] T000c: `services/share-together/web/src/app/api/` の全ルートをファクトリ経由に切り替える
    - `DynamoDBListRepository` 等の直接インスタンス化をファクトリ関数呼び出しに置き換える
- [x] T000d: `services/share-together/web/.env.test` を作成する
    - niconico の `.env.test` を参考に `USE_IN_MEMORY_DB=true`, `SKIP_AUTH_CHECK=true`, `TEST_USER_ID` 等を記載する
- [x] T000e: `/api/test/reset` エンドポイントを `services/share-together/web/src/app/api/test/` に追加する
    - `USE_IN_MEMORY_DB=true` のときのみ有効なリセットエンドポイントを追加する
    - niconico の `/api/test/videos` を参考に実装する
- [x] T000f: 既存 E2E テスト（personal-todo・personal-lists・group-management・group-shared-todo）を
    インメモリ DB 起動方式へ移行する
    - `page.route()` モックを削除し、実際の API 呼び出しに置き換える
    - `beforeEach` に `/api/test/reset` + 初期データ投入を追加する
    - `/api/auth/session` のモックを削除し、`SKIP_AUTH_CHECK=true` + `TEST_USER_ID` に置き換える
    - 補足: `/api/groups` のレスポンス変更（`currentUserId` 追加）に伴う Web Unit Tests の期待値整合も対応済み

**個人 ToDo 管理（FR-008）**

- [ ] T001: `personal-todo.spec.ts` の `test.fixme('ToDo を編集できる')` を実装する
    - T000f 完了後、インメモリ DB 起動方式でタイトル編集フローを検証する

**グループ機能拡充（FR-015・FR-022）**

- [ ] T002: グループ削除テストを `group-management.spec.ts` に追加する
    - オーナーがグループを削除できることを検証
    - グループ削除後にグループ一覧から消えることを確認
    - グループ削除後のメンバーシップ・共有リストの整合性も検証する
- [ ] T003: グループ名変更テストを `group-management.spec.ts` に追加する
    - オーナーのみがグループ名を変更できることを検証
    - 非オーナーには変更 UI が表示されないことを確認
- [ ] T004: グループオーナーが脱退できないことのテストを追加する
    - オーナーの画面では「グループを脱退」ボタンが表示されない、
      または無効化されていることを検証

**グループ共有 ToDo 拡充（FR-019・FR-021）**

- [ ] T005: `group-shared-todo.spec.ts` に共有 ToDo 完了テストを追加する
    - チェックボックスで完了状態に変更できることを検証
- [ ] T006: `group-shared-todo.spec.ts` に共有 ToDo 削除テストを追加する
    - 削除後に一覧から消えることを確認
- [ ] T007: `group-shared-todo.spec.ts` に共有リスト名変更・削除テストを追加する
    - リスト名変更フローを検証
    - リスト削除後に一覧から消えることを確認

**アクセス制御（SC-004）**

- [ ] T008: 他ユーザーの個人リストへの不正アクセス検証を追加する
    - `TEST_USER_ID` を切り替えて別ユーザーの個人リスト API が 403 を返すことを検証
    - UI 側で適切なエラーが表示されることを確認

**エッジケース**

- [ ] T009: `group-management.spec.ts` に重複招待防止のテストを追加する
    - 既に招待済みのユーザーへの招待送信でエラーメッセージが表示されることを検証

**Core 統合 E2E（リポジトリレイヤー）**

- [ ] T010: `services/share-together/core/tests/e2e/` ディレクトリを作成し、
    インメモリリポジトリを使った統合テストを追加する
    - 個人リストと ToDo の作成・取得・更新・削除の一連フローをテスト
    - グループ作成・メンバーシップ・共有リスト・共有 ToDo の複数エンティティ連携をテスト
    - stock-tracker の `holding.repository.e2e.test.ts` を参考に実装する

**個人リスト上限制御の実装完了（FR-005）**

現状: core 検証は実装済み。API エラーハンドリングが 500 フォールスルー、UI 側の上限制御が未実装。

- [ ] T011a: `services/share-together/web/src/app/api/lists/route.ts` の POST ハンドラに
    `PERSONAL_LIST_LIMIT_EXCEEDED` エラーの明示的ハンドリングを追加する
    - `PERSONAL_LIST_LIMIT_EXCEEDED` エラーメッセージを error 定数に追加する
    - 上限超過時に 409 Conflict を返すよう修正する
- [ ] T011b: リスト作成 UI に上限 100 件の制御を追加する
    - ユーザーの現在のリスト件数を取得し、100 件以上の場合は「リストを作成」ボタンを無効化する
    - 上限到達時のエラーメッセージ（「個人リストは100件まで作成できます」）を表示する
- [ ] T011c: `personal-lists.spec.ts` に個人リスト上限 100 件の E2E テストを追加する
    - 100 件到達時に作成ボタンが無効化されていることを検証
    - API から 409 が返ったときにエラーメッセージが表示されることを検証

**グループ最大メンバー数制御の実装完了（FR-023）**

現状: core 検証は実装済み。API エラーハンドリングが 500 フォールスルー、UI 側の上限制御が未実装。

- [ ] T012a: `services/share-together/web/src/app/api/groups/[groupId]/members/route.ts` の POST ハンドラに
    `MEMBER_LIMIT_EXCEEDED` エラーの明示的ハンドリングを追加する
    - 上限超過時に 409 Conflict を返すよう修正する
- [ ] T012b: `InviteForm.tsx` にグループ最大 5 名の制御を追加する
    - 現在の承認済みメンバー数を取得し、5 名以上の場合は「招待を送信」ボタンを無効化する
    - 上限到達時のエラーメッセージ（「グループメンバーは最大5名です」）を表示する
- [ ] T012c: `group-management.spec.ts` にグループ最大メンバー数 5 名の E2E テストを追加する
    - 5 名到達時に招待ボタンが無効化されていることを検証
    - API から 409 が返ったときにエラーメッセージが表示されることを検証

---

## 実装方針・注意事項

### インメモリ DB 起動方式の手順

1. `.env.test` を読み込んだ状態でアプリサーバーを起動する（`next dev` + `.env.test`）
2. `beforeEach` で `/api/test/reset` を呼び出してインメモリストアをクリアする
3. `beforeEach` で必要な初期データを API 経由で投入する（ユーザー・グループ・リスト等）
4. テストを実行する（実際の API ルートを通してリクエスト）
5. アサーションは画面表示 + 必要に応じて API レスポンスの両方で確認する

### テストユーザーの切り替え

- 基本は `TEST_USER_ID=test-user-id` の単一ユーザーで検証する
- ロール・所有権の検証が必要なテスト（非オーナー確認等）では、
  別ユーザーとして動作させるためのデータ構造（グループメンバーシップ）を
  初期データ投入時に作成して対応する

### テスト間の独立性確保

- `/api/test/reset` は全インメモリリポジトリを一括クリアする
- グループ・メンバーシップ等複数エンティティが絡む場合は、
  `beforeEach` で必要な初期データをすべて投入してからテストを開始する

---

## 備考・未決定事項

- **FR-024（招待の自動失効）**: 時間経過を伴うため E2E での自動テストは現実的でない。
  ユニットテスト（`membership-repository` の有効期限チェック）でのカバーを推奨する。
- **Share Together の認証連携（FR-001〜FR-003）**: 実 Auth サービスとの SSO 結合テストは
  E2E の対象外とし、middleware ユニットテストでカバーする方針を継続する。
