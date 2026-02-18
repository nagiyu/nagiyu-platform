# 動画一覧画面に名前検索機能を追加

## 概要

Niconico Mylist Assistant の動画一覧画面（`/mylist`）にて、動画のタイトルを部分一致で検索できる機能を追加する。

既存のお気に入りフィルターとスキップフィルターに加えて、テキスト入力による名前検索を追加し、これらをアンド検索として組み合わせることで、ユーザーが目的の動画をより効率的に見つけられるようにする。

## 関連情報

- **タスクタイプ**: サービスタスク（niconico-mylist-assistant）
- **関連Issue**: GitHub Issue - [Feature] 動画を名前で検索できるようにする
- **影響範囲**: フロントエンド（UI）、バックエンド（API）、コアロジック

## 要件

### 機能要件（FR）

#### FR1: テキスト入力フィールドの追加

動画一覧画面のフィルター領域に、動画タイトルを検索するためのテキスト入力フィールドを追加する。

- Material-UIの`TextField`コンポーネントを使用
- プレースホルダー: 「動画タイトルで検索」
- デバウンス処理を実装し、入力後500ms後に検索を実行（過度なAPI呼び出しを防ぐ）

#### FR2: 部分一致検索の実装

入力されたキーワードで動画タイトルの部分一致検索を実行する。

- 大文字小文字を区別しない検索（case-insensitive）
- 空文字列の場合は検索条件なし（全動画を対象）
- 前後の空白は自動的にトリムする

#### FR3: 既存フィルターとのアンド検索

名前検索は既存のフィルター（お気に入り、スキップ）とアンド条件で組み合わせる。

- 例: 「お気に入りのみ」+ 「スキップ以外」+ 「東方」を含む動画
- フィルター変更時はページをリセット（offset=0）

#### FR4: URL同期

検索キーワードをURLクエリパラメータに反映し、ブラウザバック/フォワードで状態を復元できるようにする。

- クエリパラメータ名: `search`
- 例: `/mylist?search=東方&favorite=true`

#### FR5: 検索結果の表示

検索結果が0件の場合、既存の空状態メッセージを表示する。

- 「動画が見つかりませんでした」
- 「フィルター条件を変更するか、動画をインポートしてください」

### 非機能要件（NFR）

#### NFR1: 既存機能への影響なし

- 既存のフィルター機能（お気に入り、スキップ）は変更なく動作すること
- 既存のページネーション機能は変更なく動作すること
- 既存のURL同期機能は変更なく動作すること

#### NFR2: パフォーマンス

- デバウンス処理により、ユーザーの入力中に過度なAPI呼び出しを行わない
- クライアント側で追加のフィルタリングを行わず、サーバー側で検索を実行
- 既存の検索処理（フィルタリング）のパフォーマンスに影響を与えない

#### NFR3: テストカバレッジ

- ビジネスロジックのテストカバレッジ80%以上を維持
- 名前検索ロジックに対するユニットテスト
- E2Eテストで名前検索のUI動作を検証

## 実装方針

### 技術スタック

- **フロントエンド**: React (Next.js), Material-UI, TypeScript
- **バックエンド**: Next.js API Routes, TypeScript
- **データ層**: @nagiyu/niconico-mylist-assistant-core
- **テスト**: Jest (単体テスト), Playwright (E2E)

### アーキテクチャ方針

本機能は以下の3層で実装する:

#### 1. UI層（`services/niconico-mylist-assistant/web/src/components/`）

`VideoListFilters.tsx`に検索用テキストフィールドを追加:

- Material-UIの`TextField`コンポーネントを使用
- デバウンス処理を実装（useDebounceフックまたは類似の仕組み）
- 検索キーワードをpropsで親コンポーネントに渡す

`VideoList.tsx`で検索状態を管理:

- 検索キーワードを状態として保持
- URLクエリパラメータと同期
- APIリクエストに検索キーワードを含める

#### 2. API層（`services/niconico-mylist-assistant/web/src/app/api/videos/route.ts`）

GET `/api/videos`エンドポイントに`search`クエリパラメータを追加:

- クエリパラメータ: `search` (オプショナル)
- バリデーション: 文字列として受け取り、前後の空白をトリム
- coreパッケージの`listVideosWithSettings`に検索キーワードを渡す

#### 3. コアロジック層（`services/niconico-mylist-assistant/core/src/db/videos.ts`）

`listVideosWithSettings`関数にオプショナルな`searchKeyword`パラメータを追加:

- 動画タイトルに対する部分一致検索を実装
- 大文字小文字を区別しない検索（`toLowerCase()`を使用）
- 既存のフィルター（isFavorite, isSkip）とアンド条件で組み合わせ

### データフロー

1. ユーザーがテキストフィールドに検索キーワードを入力
2. デバウンス処理（500ms）後、`VideoList`コンポーネントが検索キーワードを状態に保存
3. URLが更新される（例: `/mylist?search=東方`）
4. `fetchVideos`関数がAPIを呼び出し、検索キーワードを含める
5. API Routeがクエリパラメータを検証し、coreロジックに渡す
6. `listVideosWithSettings`が検索とフィルタリングを実行
7. 結果がレスポンスとして返され、UIに表示される

### 考慮事項

#### デバウンス処理の実装

以下のいずれかの方法でデバウンスを実装:

- **オプション1**: lodashの`debounce`関数を使用（プロジェクトで既に使用している場合）
- **オプション2**: カスタムフック`useDebounce`を実装
- **オプション3**: Material-UIの入力イベントとsetTimeoutを組み合わせる

推奨: プロジェクトの既存パターンに合わせる

#### 検索ロジックの配置

検索ロジックは`listVideosWithSettings`関数内で実装する理由:

- フィルタリングロジックの一元化（お気に入り、スキップと同じ場所）
- ページネーションとの整合性を保つ（検索結果に対してページネーション）
- テスタビリティの向上（Repository Patternによりモックが容易）

#### URL同期の実装

既存の`updateURL`関数を拡張し、`search`パラメータをサポート:

- 検索キーワードが空文字列の場合、URLパラメータに含めない
- フィルター変更時と同様に、検索キーワード変更時もページをリセット（offset=0）

## タスク分解

### Phase 1: 準備（プロジェクト理解とテスト環境の確認）

- [x] T001: 既存の動画一覧機能のコードを確認
    - `VideoList.tsx`, `VideoListFilters.tsx`
    - `/api/videos` API Route
    - `listVideosWithSettings` コアロジック
- [x] T002: 既存のテストを実行し、ベースラインを確認
    - ユニットテスト: `npm run test --workspace @nagiyu/niconico-mylist-assistant-core`
    - E2E: `npm run test:e2e --workspace @nagiyu/niconico-mylist-assistant-web`
- [x] T003: デバウンス処理の実装方針を決定
    - プロジェクトで既に使用しているライブラリやパターンを確認

#### Phase 1 調査結果（2026-02-18）

- T001 コード調査結果:
    - `VideoList.tsx` は `favorite/skip/offset` を URL と同期し、`fetchVideos` で `/api/videos` を再取得する構成
    - `VideoListFilters.tsx` はお気に入り/スキップの2フィルターのみを提供し、検索入力UIは未実装
    - `/api/videos` は `limit/offset/isFavorite/isSkip` をパースして `listVideosWithSettings` に委譲
    - `listVideosWithSettings` はユーザー設定取得後に `isFavorite/isSkip` をメモリ上で絞り込み、offset/limit でページネーション
- T002 テストベースライン:
    - core unit: `npm run test --workspace @nagiyu/niconico-mylist-assistant-core` は成功（16 suites / 211 tests passed）
    - web e2e: `npm run test:e2e --workspace @nagiyu/niconico-mylist-assistant-web` は環境依存エラーで失敗
        - 初回は `@nagiyu/niconico-mylist-assistant-core` 未解決（依存 workspace の事前 build が必要）
        - 依存 build 後は `@nagiyu/ui` 未解決（`@nagiyu/ui` 系 workspace の事前 build が必要）
        - Playwright ブラウザ未導入環境では `Executable doesn't exist` が発生しうるため `npx playwright install` が必要
- T003 デバウンス方針:
    - niconico-mylist-assistant サービス内で `lodash.debounce` / `useDebounce` の既存利用はなし
    - 既存実装（`mylist/register/page.tsx`）に合わせ、`setTimeout + clearTimeout` を `useEffect` で管理する方針を採用
    - Phase 4 では入力値の即時 state と API 問い合わせ用 debounced state を分離し、500ms デバウンスを実装する

### Phase 2: コアロジックの実装とテスト

- [ ] T004: `listVideosWithSettings`関数に`searchKeyword`パラメータを追加
    - ファイル: `services/niconico-mylist-assistant/core/src/db/videos.ts`
    - 型定義も更新
- [ ] T005: 名前検索ロジックを実装
    - 大文字小文字を区別しない部分一致検索
    - 既存フィルターとのアンド条件
- [ ] T006: 名前検索ロジックのユニットテストを作成
    - ファイル: `services/niconico-mylist-assistant/core/tests/db/videos.test.ts`（または新規作成）
    - テストケース:
        - 検索キーワードなし → 全動画を返す
        - 検索キーワードあり（一致） → 該当動画を返す
        - 検索キーワードあり（不一致） → 空配列を返す
        - 大文字小文字の混在 → 正しく検索される
        - 既存フィルターとの組み合わせ → アンド条件で動作
- [ ] T007: coreのテストカバレッジを確認（80%以上を維持）

### Phase 3: API層の実装とテスト

- [ ] T008: `/api/videos`エンドポイントに`search`クエリパラメータを追加
    - ファイル: `services/niconico-mylist-assistant/web/src/app/api/videos/route.ts`
    - クエリパラメータのパース、バリデーション、トリム
- [ ] T009: `listVideosWithSettings`呼び出し時に`searchKeyword`を渡す
- [ ] T010: APIのユニットテストを作成（必要に応じて）
    - 既存のテストパターンに従う

### Phase 4: UI層の実装

- [ ] T011: `VideoListFilters.tsx`に検索用テキストフィールドを追加
    - ファイル: `services/niconico-mylist-assistant/web/src/components/VideoListFilters.tsx`
    - Material-UIの`TextField`コンポーネントを使用
    - Propsに`searchKeyword`と`onSearchKeywordChange`を追加
- [ ] T012: `VideoList.tsx`で検索キーワードの状態管理を実装
    - ファイル: `services/niconico-mylist-assistant/web/src/components/VideoList.tsx`
    - `useState`で検索キーワードを管理
    - デバウンス処理を実装
- [ ] T013: URLクエリパラメータとの同期を実装
    - `updateURL`関数を拡張し、`search`パラメータをサポート
    - URL変更時に検索キーワードを復元
- [ ] T014: `fetchVideos`関数を更新し、検索キーワードをAPIリクエストに含める

### Phase 5: E2Eテストの作成

- [ ] T015: 名前検索機能のE2Eテストを作成
    - ファイル: `services/niconico-mylist-assistant/web/e2e/video-list.spec.ts`
    - テストケース:
        - 検索フィールドが表示される
        - 検索キーワード入力後、該当動画のみが表示される
        - 検索結果が0件の場合、空状態メッセージが表示される
        - URLに検索キーワードが反映される
        - ブラウザバック/フォワードで検索状態が復元される
        - 検索とフィルターの組み合わせが動作する

### Phase 6: 検証とドキュメント更新

- [ ] T016: ビルドとテストを実行し、すべて成功することを確認
    - ビルド: `npm run build --workspace @nagiyu/niconico-mylist-assistant-web`
    - ユニットテスト: `npm run test:coverage --workspace @nagiyu/niconico-mylist-assistant-core`
    - E2Eテスト: `npm run test:e2e --workspace @nagiyu/niconico-mylist-assistant-web`
- [ ] T017: テストカバレッジが80%以上であることを確認
- [ ] T018: 手動テストで機能を検証
    - 検索フィールドへの入力
    - フィルターとの組み合わせ
    - ページネーションとの組み合わせ
    - URL同期
- [ ] T019: ドキュメントを更新（必要に応じて）
    - `docs/services/niconico-mylist-assistant/architecture.md`
    - `docs/services/niconico-mylist-assistant/testing.md`

## テスト戦略

### ユニットテスト

**対象**: `listVideosWithSettings`関数の名前検索ロジック

**重点項目**:
- 検索キーワードなしの場合の動作
- 検索キーワードありの場合の部分一致
- 大文字小文字を区別しない検索
- 既存フィルター（isFavorite, isSkip）との組み合わせ
- 空文字列、空白のみのキーワードの扱い

**カバレッジ目標**: 80%以上（プロジェクト標準）

### E2Eテスト

**対象**: 動画一覧画面の名前検索UI

**重点項目**:
- 検索フィールドの表示
- 検索キーワード入力後の動画フィルタリング
- 検索結果0件時の空状態表示
- URL同期（ブラウザバック/フォワード）
- フィルターとの組み合わせ

**デバイス**: Fast CI（chromium-mobile）、Full CI（全デバイス）

## 受け入れ基準

本機能は以下の条件を満たした時点で完了とする:

- [ ] 動画一覧画面に検索用テキストフィールドが表示される
- [ ] 検索キーワードを入力すると、該当する動画のみが表示される
- [ ] 検索はお気に入り・スキップフィルターとアンド条件で動作する
- [ ] URLに検索キーワードが反映され、ブラウザバック/フォワードで復元される
- [ ] 検索結果が0件の場合、適切な空状態メッセージが表示される
- [ ] すべてのビルドが成功する
- [ ] すべてのユニットテストが成功する（カバレッジ80%以上）
- [ ] すべてのE2Eテストが成功する
- [ ] 既存機能（フィルター、ページネーション、URL同期）に影響がない

## 参考ドキュメント

- [niconico-mylist-assistant README](../../docs/services/niconico-mylist-assistant/README.md)
- [niconico-mylist-assistant 要件定義](../../docs/services/niconico-mylist-assistant/requirements.md)
- [niconico-mylist-assistant アーキテクチャ](../../docs/services/niconico-mylist-assistant/architecture.md)
- [niconico-mylist-assistant テスト戦略](../../docs/services/niconico-mylist-assistant/testing.md)
- [コーディング規約](../../docs/development/rules.md)
- [テスト戦略](../../docs/development/testing.md)

## 備考・未決定事項

### デバウンス処理の実装詳細

プロジェクトで既に使用しているパターンに合わせる必要がある。実装フェーズで確認すること。

### 検索のパフォーマンス最適化

初期実装では全件取得後にフィルタリングを行う方式（既存のフィルター処理と同じ）で問題ないが、将来的に動画数が大幅に増加した場合は、DynamoDBのQuery/Scan最適化やGSI（Global Secondary Index）の追加を検討する必要がある。

### 検索履歴やサジェスト機能

本タスクのスコープ外だが、将来的な改善として以下を検討する余地がある:
- 検索履歴の保存（LocalStorage）
- オートコンプリート/サジェスト機能
- 検索結果のハイライト表示
