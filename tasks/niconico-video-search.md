# 動画検索機能の追加（niconico-mylist-assistant）

## 概要

niconico-mylist-assistant にて、ユーザーが自由入力でニコニコ動画を検索し、
検索結果を一覧表示して動画一覧に追加できる機能を実装する。

検索の実現方法は Playwright（ブラウザ自動化）ではなく、
ニコニコ動画の検索ページの静的 HTML を解析して動画 ID を抽出し、
各 ID に対して既存の動画情報取得 API を呼び出すアプローチを採用する。

## 関連情報

- Issue: 動画検索ができるようにする
- タスクタイプ: サービスタスク（niconico-mylist-assistant）
- 参考実装: [nagiyu/niconico-mylist-assistant](https://github.com/nagiyu/niconico-mylist-assistant)

## 要件

### 機能要件

- FR1: ユーザーがキーワードを自由入力してニコニコ動画の検索を実行できる
- FR2: 検索結果（タイトル・サムネイル等）を一覧形式で表示できる
- FR3: 検索結果の各動画に「追加」ボタンを設け、押下で動画一覧（DB）に追加できる
- FR4: 既に動画一覧に登録済みの動画はスキップ（重複排除）またはそれと分かる表示を行う
- FR5: 検索はニコニコ動画の検索ページの静的 HTML を解析して動画 ID を抽出するアプローチを取る

### 非機能要件

- NFR1: 既存の `getVideoInfoBatch` を活用し、検索結果の動画情報取得を効率化する
- NFR2: テストカバレッジ 80% 以上を維持する
- NFR3: TypeScript strict mode に準拠する
- NFR4: エラーメッセージは日本語で `ERROR_MESSAGES` 定数として定義する
- NFR5: UI 層とビジネスロジック層を分離する（`components/` vs `lib/` / `core`）

## 実装のヒント

### 検索ロジックの方針

1. ニコニコ動画の検索 URL（`https://www.nicovideo.jp/search/{キーワード}`）に対して HTTP GET を行う
2. レスポンスの HTML から動画 ID（`sm123456` のような形式）を正規表現または HTML パーサーで抽出する
3. 抽出した動画 ID のリストを既存の `getVideoInfoBatch` に渡して詳細情報を取得する
4. 取得した詳細情報を API レスポンスとして返す

### 追加ロジックの方針

- 検索結果から「追加」ボタンを押すと、既存の `/api/videos/bulk-import` エンドポイントを呼び出す
- `bulk-import` は既に重複チェック（DB に存在する場合はスキップ）を実装済みのため、そのまま利用する

### 既存コードとの対応関係

- 動画情報取得: `core/src/niconico/batch.ts` の `getVideoInfoBatch` を再利用
- 動画追加: `web/src/app/api/videos/bulk-import/route.ts` を再利用
- 動画表示コンポーネント: `VideoCard.tsx` のスタイルを参考に検索結果用カードを実装
- HTML 解析ユーティリティ: `core/src/niconico/` に追加する

## タスク

### Phase 1: コア層の拡張（@nagiyu/niconico-mylist-assistant-core）

- [ ] T001: `core/src/niconico/search.ts` の作成
    - ニコニコ動画検索ページの URL 構築
    - HTML の取得（`fetch`）
    - 静的 HTML から動画 ID を抽出するパーサー関数の実装
    - `getVideoInfoBatch` との連携関数 `searchVideos(keyword: string)` の実装
- [ ] T002: `core/src/niconico/constants.ts` に検索関連の定数を追加
    - 検索 URL のベースパス
    - エラーメッセージ（日本語）
- [ ] T003: `core/src/niconico/index.ts` に `search.ts` のエクスポートを追加
- [ ] T004: `core/tests/` に検索機能のユニットテストを追加（カバレッジ 80% 以上）

### Phase 2: Web API エンドポイントの追加（@nagiyu/niconico-mylist-assistant-web）

- [ ] T005: `web/src/app/api/videos/search/route.ts` の作成
    - `GET /api/videos/search?q={キーワード}` エンドポイントの実装
    - コア層の `searchVideos` を呼び出す
    - レスポンス形式: `{ videos: NiconicoVideoInfo[], total: number }`
    - バリデーション: キーワード必須、最大文字数チェック
    - 認証チェック（既存エンドポイントに倣う）
- [ ] T006: `web/src/tests/` に API エンドポイントのテストを追加

### Phase 3: フロントエンド UI の追加

- [ ] T007: `web/src/components/VideoSearchModal.tsx` の作成
    - キーワード入力フォーム
    - 検索実行ボタン
    - 検索結果一覧（サムネイル・タイトル・各動画に「追加」ボタン）
    - 既に登録済みの動画は追加済みと表示
    - ローディング状態・エラー状態の表示
- [ ] T008: `web/src/app/mylist/page.tsx` または `VideoList.tsx` に検索モーダルを開くボタンを追加
- [ ] T009: フロントエンドの型定義を `web/src/types/` に追加（必要な場合）

### Phase 4: テストと品質確認

- [ ] T010: E2E テスト（Playwright）の追加（検索・追加フローの基本動作確認）
- [ ] T011: カバレッジ閾値（80%）のパスを確認

## 参考ドキュメント

- `docs/services/niconico-mylist-assistant/architecture.md` - サービスのアーキテクチャ方針
- `docs/services/niconico-mylist-assistant/requirements.md` - 既存の要件定義
- `docs/development/rules.md` - コーディング規約（必須）
- `docs/development/testing.md` - テスト戦略

## 備考・未決定事項

- ニコニコ動画の検索ページの HTML 構造は変更されることがある。パーサーの堅牢性を考慮し、
  複数のセレクタ候補を持つか、動画 ID 形式の正規表現マッチを主な抽出手段とすることを推奨する
- 検索結果の件数上限（ページネーション対応の要否）は実装時に検討する
- ニコニコ動画への過度なアクセスを避けるため、レートリミットや検索結果の件数制限を設けることを推奨する
- 認証なしユーザーへの動画検索の公開可否は要確認（現状の動画一覧ページは認証必須）
