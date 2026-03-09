# Share Together E2E の充実計画

## 概要

`specs/001-share-together/spec.md` で定義された機能要件に対し、Share Together の E2E テストカバレッジを向上させる。
認証系（実 OAuth フロー）は E2E での検証が困難なため除外し、それ以外の機能については
`page.route()` モックとインメモリリポジトリ起動の 2 方式を組み合わせて E2E での検証を充実させる。

本ドキュメントは現状分析と充実計画をまとめ、以降の実装タスクの基盤とする。

## 関連情報

- Issue: E2E の充実
- タスクタイプ: サービスタスク（Share Together）
- 主要ドキュメント:
    - `specs/001-share-together/spec.md` - Share Together 機能要件
    - `docs/development/testing.md` - テスト戦略（E2E 方針・CI 戦略）
    - `docs/services/share-together/testing.md` - Share Together テスト仕様

---

## 現状分析

### E2E テストの実装状況（`services/share-together/web/tests/e2e/`）

| ファイル | 対応要件 | 状態 |
| --- | --- | --- |
| `personal-todo.spec.ts` | FR-008 個人 ToDo の CRUD | **部分実装**（編集が `test.fixme`） |
| `personal-lists.spec.ts` | FR-005〜007 個人リスト管理 | 実装済み（一部エッジケースなし） |
| `group-management.spec.ts` | FR-010〜014 グループ管理 | 実装済み（FR-015・FR-022〜024 なし） |
| `group-shared-todo.spec.ts` | FR-017〜020 グループ共有 ToDo | **部分実装**（ToDo の完了・編集・削除が未実装） |

### インメモリリポジトリの実装状況

Share Together のインメモリリポジトリ（Group, User, Membership, Todo, List）はすべて実装済みだが、
現時点ではユニットテストのみで活用されており、core 統合 E2E での利用は未実施。

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
| エッジケース | セッション切れ時の操作エラーと再ログイン誘導 | ❌ 未カバー |

---

## E2E テスト戦略

Share Together では以下の 2 つのアプローチを組み合わせる。

### アプローチ A: `page.route()` モック方式（既存・継続）

- `page.route()` で API レスポンスをモック
- セッション情報（`/api/auth/session`）を固定ユーザーで返す
- テスト内で状態配列（`let todos: Todo[]`）を管理し、CRUD 操作をモックで再現
- **利点**: 外部依存なし、高速、実装が簡潔
- **適用済み**: Share Together の全既存 E2E テスト（personal-todo・personal-lists・group-management・group-shared-todo）
- **適用場面**: UI インタラクションの確認、エラーレスポンス時の UI 挙動検証

### アプローチ B: インメモリ DB 起動方式（新規導入・要実装）

niconico-mylist-assistant が採用している方式を Share Together にも導入する。

- `USE_IN_MEMORY_DB=true` 環境変数でアプリを起動し、API ルートがインメモリリポジトリを使用するよう切り替える
- `SKIP_AUTH_CHECK=true` で認証をバイパスし、`TEST_USER_ID` 等の環境変数で固定テストユーザーを使用する
- テストデータは API 経由（`/api/test/reset` 等）で `beforeEach` にセットアップ・クリーンアップ
- **利点**: 実際の API ルートとビジネスロジックを通した検証ができる（`page.route()` ではスタブの精度に依存）
- **適用場面**: 複数エンティティ間の整合性検証（グループ削除後のメンバーシップ・共有リスト等）、バリデーションロジックの検証

#### 導入に必要な実装（T000 系として追加）

Share Together web の API ルートは現在 `DynamoDBListRepository` 等を直接インスタンス化しており、
niconico のようなファクトリーパターンが未実装。以下の整備が前提となる。

| 実装項目 | 現状 | 必要な変更 |
| --- | --- | --- |
| リポジトリファクトリ | なし（API ルートで直接 DynamoDB リポジトリをインスタンス化） | `USE_IN_MEMORY_DB` で切り替えるファクトリ関数を core に追加 |
| セッションモック | `middleware.ts` は `SKIP_AUTH_CHECK=true` 対応済み、`getSessionOrUnauthorized` は未対応 | niconico の `getSession` 相当のモック返却ロジックを追加 |
| `.env.test` | なし | `USE_IN_MEMORY_DB=true`, `SKIP_AUTH_CHECK=true`, `TEST_USER_*` を記載 |
| テストデータ API | なし | `/api/test/reset` エンドポイント（`USE_IN_MEMORY_DB=true` 時のみ有効）を追加 |

### 認証系テストの扱い方針

| テスト対象 | 方針 |
| --- | --- |
| Google OAuth フロー | **E2E 対象外**（外部サービス依存・CI 環境での安定実行が困難） |
| 未認証リダイレクト | **E2E 対象外**（`SKIP_AUTH_CHECK=true` 環境では検証不可）、middleware のユニットテストでカバー |
| ロールベースアクセス制御（RBAC） | **E2E で継続**（`SKIP_AUTH_CHECK=true` でロールを固定して検証） |
| セッション切れ時の挙動 | **E2E でモック検証**（`page.route()` で 401 を返しリダイレクトを検証） |

---

## タスクリスト

**【前提】インメモリ DB 起動方式の導入（アプローチ B の基盤整備）**

- [ ] T000a: `services/share-together/core/` にリポジトリファクトリを追加する
    - niconico の `factory.ts` を参考に、`USE_IN_MEMORY_DB=true` の場合にインメモリリポジトリを返す
      ファクトリ関数（`createListRepository`, `createTodoRepository`, `createGroupRepository` 等）を実装する
    - すべてのエンティティ（List, Todo, Group, User, Membership）のファクトリを追加する
- [ ] T000b: `services/share-together/web/src/lib/auth/session.ts` に `SKIP_AUTH_CHECK` 対応を追加する
    - `SKIP_AUTH_CHECK=true` の場合、`TEST_USER_ID` / `TEST_USER_EMAIL` / `TEST_USER_NAME` 環境変数から
      固定セッションを返すよう `getSessionOrUnauthorized` を更新する（niconico の `getSession` 相当）
- [ ] T000c: `services/share-together/web/src/app/api/` の全ルートをファクトリ経由に切り替える
    - `DynamoDBListRepository` 等の直接インスタンス化をファクトリ関数呼び出しに置き換える
- [ ] T000d: `services/share-together/web/.env.test` を作成する
    - `USE_IN_MEMORY_DB=true`, `SKIP_AUTH_CHECK=true`, `TEST_USER_ID=test-user-id` 等を記載する
- [ ] T000e: `/api/test/reset` エンドポイントを `services/share-together/web/src/app/api/test/` に追加する
    - `USE_IN_MEMORY_DB=true` のときのみ有効なリセットエンドポイントを追加する
    - niconico の `/api/test/videos` を参考に実装する

**個人 ToDo 管理（FR-008）**

- [ ] T001: `personal-todo.spec.ts` の `test.fixme('ToDo を編集できる')` を実装する
    - インラインの入力フィールドまたはモーダルでのタイトル編集フローを検証
    - PUT リクエストのモックを追加

**グループ機能拡充（FR-015・FR-022）**

- [ ] T002: グループ削除テストを `group-management.spec.ts` に追加する
    - オーナーがグループを削除できることを検証
    - グループ削除後にグループ一覧から消えることを確認
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

- [ ] T008: `group-shared-todo.spec.ts` に個人リストへの不正アクセス検証を追加する
    - 他ユーザーの個人リスト API が 403 を返す場合の UI 表示を検証

**エッジケース**

- [ ] T009: `group-management.spec.ts` に重複招待防止のテストを追加する
    - 既に招待済みのユーザーへの招待送信でエラーメッセージが表示されることを検証
- [ ] T010: `personal-todo.spec.ts` または `personal-lists.spec.ts` に
    セッション切れ時の挙動テストを追加する
    - `page.route()` で 401 を返し、再ログイン誘導が表示されることを検証

**Core 統合 E2E（リポジトリレイヤー）**

- [ ] T011: `services/share-together/core/tests/e2e/` ディレクトリを作成し、
    インメモリリポジトリを使った統合テストを追加する
    - 個人リストと ToDo の作成・取得・更新・削除の一連フローをテスト
    - グループ作成・メンバーシップ・共有リスト・共有 ToDo の複数エンティティ連携をテスト
    - stock-tracker の `holding.repository.e2e.test.ts` を参考に実装する

---

## 実装方針・注意事項

### `page.route()` モックの管理（アプローチ A）

- テスト内でミュータブルな配列（`let items: Item[]`）を状態として管理し、
  POST/PUT/DELETE の結果を配列に反映することで CRUD の連続操作をシミュレートする
- `beforeEach` でモックルートを登録し、テスト間の独立性を確保する
- Service Worker が `page.route()` のモックをバイパスする場合は
  `test.use({ serviceWorkers: 'block' })` を設定する（グループ系は適用済み）

### インメモリ DB 起動方式の留意点（アプローチ B）

- `beforeEach` で `/api/test/reset` を呼び出してインメモリストアをクリアし、テスト間の独立性を確保する
- E2E テストはアプリサーバーを `USE_IN_MEMORY_DB=true` で起動した状態で実行する
- niconico の `.env.test` と同じパターンで `services/share-together/web/.env.test` を管理する

### 認証のモック方法

- アプローチ A: `/api/auth/session` を `page.route()` でモックし、固定ユーザー ID を返す
- アプローチ B: `SKIP_AUTH_CHECK=true` + `TEST_USER_ID` 環境変数で middleware と API ルートの両方をバイパス

---

## 備考・未決定事項

- **FR-024（招待の自動失効）**: 時間経過を伴うため E2E での自動テストは現実的でない。
  ユニットテスト（`membership-repository` の有効期限チェック）でのカバーを推奨する。
- **FR-005（個人リスト上限 100 件）**: UI 側での制限表示が実装されている場合は
  E2E テストを追加する。現時点では API バリデーションのユニットテストでカバーする。
  UI 実装後に T012 として追加することを検討する。
- **FR-023（グループ最大 5 名）**: 招待 API のバリデーションエラーとして検証する方針で
  E2E での実装可否を確認する必要がある。確認後に T013 として追加することを検討する。
- **Share Together の認証連携（FR-001〜FR-003）**: 実 Auth サービスとの SSO 結合テストは
  E2E の対象外とし、middleware ユニットテストでカバーする方針を継続する。
