# E2E の充実計画

## 概要

`specs/` で定義された機能要件に対し、E2E テストのカバレッジを向上させる。
認証系（実 OAuth フロー）は E2E での検証が困難なため除外し、それ以外の機能については
インメモリリポジトリ・`page.route()` モックを活用して E2E での検証を充実させる。

本ドキュメントは現状分析と充実計画をまとめ、以降の実装タスクの基盤とする。

## 関連情報

- Issue: E2E の充実
- タスクタイプ: プラットフォームタスク（複数サービス横断）
- 主要ドキュメント:
    - `docs/development/testing.md` - テスト戦略（E2E 方針・CI 戦略）
    - `specs/001-share-together/spec.md` - Share Together 機能要件
    - `docs/services/*/testing.md` - 各サービスのテスト仕様

---

## 現状分析

### E2E テストの実装状況

#### Auth サービス (`services/auth/web/e2e/`)

| ファイル | 内容 | 状態 |
| --- | --- | --- |
| `auth.spec.ts` | サインインページ表示・ヘルスチェック | 実装済み |
| `role-assignment.spec.ts` | ロール割り当てフロー | ほぼ `test.skip`（認証必須のため） |

**方針**: `SKIP_AUTH_CHECK=true` 環境では実際の OAuth フローのテストは不可。
サインインページ表示・エラーページ表示の範囲が限界。

---

#### Stock Tracker (`services/stock-tracker/web/tests/e2e/`)

| ファイル | 対応シナリオ | 状態 |
| --- | --- | --- |
| `top-page-layout.spec.ts`, `top-page-selector.spec.ts`, `chart-display.spec.ts` | E2E-001 チャート表示 | 実装済み |
| `alert-management.spec.ts` | E2E-002 アラート設定（一部） | **部分実装**（アラート一覧の編集・削除が未実装） |
| `holding-management.spec.ts` | E2E-003 Holding 管理 | 実装済み |
| `watchlist-management.spec.ts` | E2E-004 Watchlist 管理 | 実装済み |
| `authorization.spec.ts` | E2E-005 権限チェック | 実装済み |
| `exchange-management.spec.ts` | E2E-006 取引所管理 | 実装済み |
| `ticker-management.spec.ts` | E2E-007 ティッカー管理 | 実装済み |
| `error-handling.spec.ts` | E2E-008 エラーハンドリング | 実装済み |
| `navigation.spec.ts` | E2E-009 ナビゲーション | 実装済み |
| `quick-actions.spec.ts` | クイックアクション | 実装済み |
| `health.spec.ts` | ヘルスチェック | 実装済み |
| **core**: `holding.repository.e2e.test.ts` | InMemory を使ったリポジトリ統合 | 実装済み（Holding のみ） |

---

#### Share Together (`services/share-together/web/tests/e2e/`)

| ファイル | 対応要件 | 状態 |
| --- | --- | --- |
| `personal-todo.spec.ts` | FR-008 個人 ToDo の CRUD | **部分実装**（編集が `test.fixme`） |
| `personal-lists.spec.ts` | FR-005〜007 個人リスト管理 | 実装済み（一部エッジケースなし） |
| `group-management.spec.ts` | FR-010〜014 グループ管理 | 実装済み（FR-015・FR-022〜024 なし） |
| `group-shared-todo.spec.ts` | FR-017〜020 グループ共有 ToDo | **部分実装**（ToDo の完了・編集・削除が未実装） |

---

#### Tools (`services/tools/e2e/`)

| ファイル | 対応シナリオ | 状態 |
| --- | --- | --- |
| `transit-converter.spec.ts` | E2E-001 乗り換え変換 基本操作 | 実装済み |
| `accessibility.spec.ts` | E2E-010 アクセシビリティ | 実装済み |
| `migration-dialog.spec.ts` | E2E-006 初回訪問ダイアログ | 実装済み |
| `pwa.spec.ts` | E2E-008 PWA 機能 | 実装済み |
| `basic.spec.ts`, `homepage.spec.ts`, `required-pages.spec.ts`, `policy-dialogs.spec.ts` | 基本ページ表示 | 実装済み |
| `json-formatter.spec.ts` | JSON フォーマッター | 実装済み |

---

#### Admin (`services/admin/web/tests/e2e/`)

| ファイル | 内容 | 状態 |
| --- | --- | --- |
| `dashboard.spec.ts` | ダッシュボード表示確認 | 実装済み |
| `dashboard-display.spec.ts` | ダッシュボード詳細表示 | 実装済み |

---

#### niconico-mylist-assistant (`services/niconico-mylist-assistant/web/e2e/`)

| ファイル | 内容 | 状態 |
| --- | --- | --- |
| `test-setup.spec.ts` | テストデータセットアップ | 実装済み |
| `video-list.spec.ts` | 動画一覧・フィルター基本 | 実装済み |
| `video-detail.spec.ts` | 動画詳細 | 実装済み |
| `bulk-import.spec.ts` | 一括インポート API | 実装済み |
| `mylist-register.spec.ts` | マイリスト登録 | 実装済み |

---

### インメモリリポジトリの実装状況

| サービス | インメモリリポジトリ | 活用状況 |
| --- | --- | --- |
| Auth | `in-memory-user-repository.ts` | ユニットテストのみ |
| Stock Tracker | Exchange, Ticker, Holding, Watchlist, Alert | ユニットテスト＋Holding の core E2E |
| Share Together | Group, User, Membership, Todo, List | ユニットテストのみ |
| niconico-mylist-assistant | Video, UserSetting, BatchJob | `USE_IN_MEMORY_DB=true` で E2E に活用済み |
| libs/aws | `InMemorySingleTableStore` | 各サービスの in-memory 実装の基盤 |

---

## 機能要件と E2E カバレッジのギャップ

### Share Together（ギャップ大・優先度高）

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

### Stock Tracker（ギャップ小）

| シナリオ | 状況 |
| --- | --- |
| E2E-002 アラート一覧の編集・削除 | ❌ 未実装（ファイル内にコメントあり） |
| Core E2E: Exchange/Ticker/Watchlist/Alert リポジトリ統合 | ❌ Holding 以外未実装 |

### Tools（ギャップ中）

| シナリオ ID | 内容 | 状況 |
| --- | --- | --- |
| E2E-002 | クリップボード読み取り | ❌ `clipboard.spec.ts` が存在しない |
| E2E-003 | クリップボード書き込み | ❌ 未確認 |
| E2E-004 | Web Share Target | ❌ 未実装 |
| E2E-005 | 表示設定の永続化 | ❌ 未実装 |

### niconico-mylist-assistant（ギャップ小〜中）

| 内容 | 状況 |
| --- | --- |
| タイトル検索のデバウンス動作 | ❌ 未実装 |
| 検索キーワードの URL パラメータ同期 | ❌ 未実装 |
| ブラウザバック・フォワードでの検索条件復元 | ❌ 未実装 |
| お気に入り＋スキップフィルターの AND 条件 | ❌ 未実装 |

---

## インメモリリポジトリを活用した E2E テスト戦略

### 基本方針

E2E テストでは次の 2 つのアプローチを組み合わせる。

#### アプローチ A: `page.route()` モック方式

**対象**: Share Together web、Auth web など、認証セッションのモックが必要なサービス

- `page.route()` で API レスポンスをモック
- セッション情報（`/api/auth/session`）を固定ユーザーで返す
- テスト内で状態配列（`let todos: Todo[]`）を管理し、CRUD 操作をモックで再現
- **利点**: 外部依存なし、高速、実装が簡潔
- **適用済み**: Share Together の全 E2E テスト

#### アプローチ B: インメモリ DB 起動方式

**対象**: niconico-mylist-assistant、Stock Tracker など、サーバー側で完結するサービス

- `USE_IN_MEMORY_DB=true` 環境変数でアプリを起動
- `SKIP_AUTH_CHECK=true` で認証をバイパス（固定テストユーザー ID を使用）
- テストデータは API 経由（`/api/test/*`）または `beforeEach` でセットアップ・クリーンアップ
- **利点**: 実際の API ルートとビジネスロジックを通した検証ができる
- **適用済み**: niconico-mylist-assistant

### 認証系テストの扱い方針

| テスト対象 | 方針 |
| --- | --- |
| Google OAuth フロー | **E2E 対象外**（外部サービス依存・CI 環境での安定実行が困難） |
| 未認証リダイレクト | **E2E 対象外**（`SKIP_AUTH_CHECK=true` 環境では検証不可）、middleware のユニットテストでカバー |
| サインインページ UI | **E2E で継続**（ページ表示・エラーページの確認） |
| JWT 検証ロジック | **ユニットテストでカバー**（`libs/nextjs/tests/unit/auth.test.ts` 等） |
| ロールベースアクセス制御（RBAC） | **E2E で継続**（`SKIP_AUTH_CHECK=true` でロールを固定して検証） |
| セッション切れ時の挙動 | **E2E でモック検証**（`page.route()` で 401 を返しリダイレクトを検証） |

---

## サービスごとの E2E 充実計画

---

### 1. Share Together（最優先）

#### 背景

仕様書（`specs/001-share-together/spec.md`）に基づく機能要件の多くが E2E 未検証。
インメモリリポジトリがすべてのエンティティで実装済みのため、`page.route()` モックによる
E2E 充実が即座に可能。

#### タスクリスト

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

### 2. Stock Tracker（中優先）

#### タスクリスト

**アラート管理（E2E-002 補完）**

- [ ] T012: `alert-management.spec.ts` にアラート一覧の編集テストを追加する
    - アラート設定後、アラート一覧画面で内容を編集できることを検証
- [ ] T013: `alert-management.spec.ts` にアラート一覧の削除テストを追加する
    - アラート削除後に一覧から消えることを確認

**Core 統合 E2E 拡充**

- [ ] T014: Exchange リポジトリの統合テストを `core/tests/e2e/` に追加する
    - `InMemorySingleTableStore` を使った Exchange CRUD フローを検証
- [ ] T015: Ticker リポジトリの統合テストを `core/tests/e2e/` に追加する
    - Exchange との関連（Ticker は Exchange に紐づく）を含めて検証
- [ ] T016: Watchlist・Alert リポジトリの統合テストを `core/tests/e2e/` に追加する
    - Holding との関連を含めて検証

---

### 3. Tools（中優先）

#### タスクリスト

**クリップボード系（E2E-002・E2E-003）**

- [ ] T017: `e2e/clipboard.spec.ts` を新規作成してクリップボード読み取りテストを追加する
    - `page.evaluate()` でクリップボードにテキストをセットし、
      「クリップボード読み取り」ボタン押下後に入力フィールドへの反映を検証
    - webkit-mobile は Clipboard API の制限があるため `test.skip` を適切に設定する

**表示設定の永続化（E2E-005）**

- [ ] T018: `e2e/display-settings.spec.ts` を新規作成して設定の保存・復元テストを追加する
    - 設定変更後にページを再読み込みし、設定が LocalStorage から復元されることを検証

**エラーハンドリング（E2E-007）**

- [ ] T019: `transit-converter.spec.ts` に無効入力のエラーハンドリングテストを追加する
    - 空入力・解析不能なテキスト入力時のエラー表示を検証

---

### 4. niconico-mylist-assistant（低〜中優先）

#### タスクリスト

**タイトル検索の高度な動作**

- [ ] T020: `video-list.spec.ts` にタイトル検索のデバウンス動作テストを追加する
    - 入力後一定時間以内に連続入力しても 1 回のみ API コールされることを検証
- [ ] T021: `video-list.spec.ts` に検索キーワードの URL パラメータ同期テストを追加する
    - 検索後に URL クエリパラメータが更新されることを検証
    - ブラウザバック・フォワードで検索条件が復元されることを検証

**フィルターの AND 条件**

- [ ] T022: `video-list.spec.ts` にお気に入り＋スキップフィルターの AND 条件テストを追加する
    - お気に入り「あり」 AND スキップ「なし」の組み合わせで正しく絞り込まれることを検証

---

### 5. Admin（低優先）

#### タスクリスト

- [ ] T023: `dashboard-display.spec.ts` にサービスリンクや外部リンクの表示テストを追加する
    - ダッシュボードに表示されるサービス一覧リンクが正しいURLを持つことを検証

---

## 実装方針・注意事項

### `page.route()` モックの管理

- テスト内でミュータブルな配列（`let items: Item[]`）を状態として管理し、
  POST/PUT/DELETE の結果を配列に反映することで CRUD の連続操作をシミュレートする
- `beforeEach` でモックルートを登録し、テスト間の独立性を確保する
- Service Worker が `page.route()` のモックをバイパスする場合は
  `test.use({ serviceWorkers: 'block' })` を設定する

### インメモリ DB 方式の留意点

- `USE_IN_MEMORY_DB=true` 環境では `beforeEach` でインメモリストアの
  クリアエンドポイント（`/api/test/reset` 等）を呼び出す
- テストデータのセットアップ API が未実装のサービスでは、
  API 経由でデータを作成する setUp ヘルパーを追加する

### 認証のモック方法

- `/api/auth/session` を `page.route()` でモックし、固定ユーザー ID を返す
- ロールに依存するテストでは、セッションレスポンスにロール情報を含める

### デバイス別の考慮事項

- `Notification` API は webkit-mobile では非サポートのため、
  存在確認後に `test.skip()` で明示的にスキップする
- Service Worker 関連のテストでは `webkit-mobile` での動作差異に注意する

---

## 優先順位サマリー

| 優先度 | タスク | 対象サービス |
| --- | --- | --- |
| 高 | T001〜T010 個人/グループ/共有 ToDo の未実装・fixme を解消 | Share Together |
| 高 | T011 core 統合 E2E の追加 | Share Together |
| 中 | T012〜T013 アラート管理 E2E の補完 | Stock Tracker |
| 中 | T014〜T016 core リポジトリ統合 E2E の拡充 | Stock Tracker |
| 中 | T017〜T019 クリップボード・設定永続化・エラー処理 | Tools |
| 低 | T020〜T022 検索デバウンス・URL 同期・AND フィルター | niconico |
| 低 | T023 ダッシュボードリンク検証 | Admin |

---

## 備考・未決定事項

- **FR-024（招待の自動失効）**: 時間経過を伴うため E2E での自動テストは現実的でない。
  ユニットテスト（`membership-repository` の有効期限チェック）でのカバーを推奨する。
- **FR-005（個人リスト上限 100 件）**: UI 側での制限表示が実装されている場合は
  E2E テストを追加する。現時点では API バリデーションのユニットテストでカバーする。
  UI 実装後に T024 として追加することを検討する。
- **FR-023（グループ最大 5 名）**: 招待 API のバリデーションエラーとして検証する方針で
  E2E での実装可否を確認する必要がある。確認後に T025 として追加することを検討する。
- **Share Together の認証連携（FR-001〜FR-003）**: 実 Auth サービスとの SSO 結合テストは
  E2E の対象外とし、middleware ユニットテストでカバーする方針を継続する。
- **clipboard.spec.ts（E2E-002）**: testing.md では存在を参照しているが
  実ファイルは未作成であり、T017 として新規作成が必要。
