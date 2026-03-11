# 動画検索での既存動画検知

## 概要

Niconico Mylist Assistant の動画検索機能（`VideoSearchModal`）にて、
検索結果に既に追加済みの動画が含まれている場合でも追加ボタンが押せてしまう問題を解消する。

検索結果表示時点で「追加済み」状態を反映し、ユーザーがボタンを押さなくても
既登録の動画を識別できるようにする。

## 関連情報

- Issue: #（動画検索にて既存の動画を検知できるようにする）
- タスクタイプ: サービスタスク（`@nagiyu/niconico-mylist-assistant-web`）

---

## 現状の動作

1. `VideoSearchModal` でキーワード検索 → `GET /api/videos/search` を呼び出す
2. 検索結果（`NiconicoVideoInfo[]`）をそのまま表示し、全件に「追加」ボタンを表示
3. 「追加」ボタンを押下後、`POST /api/videos/bulk-import` の `skipped` 件数を見て
   初めて「追加済み（登録済）」表示に変わる

**問題点**: ユーザーが意図せずボタンを押下するまで既登録状態が分からない。

---

## 要件

### 機能要件

- FR1: 検索結果表示直後に、ログインユーザーが既に追加済みの動画を識別できること
- FR2: 既登録の動画には、追加ボタンの代わりに「追加済み」を示す表示を出すこと（ボタンは無効化）
- FR3: 未登録の動画は従来通り「追加」ボタンを表示すること

### 非機能要件

- NFR1: 検索レスポンス時間を著しく悪化させないこと（既登録チェックは並行実行）
- NFR2: テストカバレッジ 80% 以上を維持すること
- NFR3: TypeScript strict mode を維持すること

---

## データモデルの整理

本機能を正しく設計するにあたり、データモデルの役割を明確にしておく。

| エンティティ | テーブル種別 | 説明 |
|-------------|------------|------|
| `VideoBasicInfo` | サービス全体（グローバル） | ニコニコ動画から取得した動画基本情報。全ユーザーで共有。インポート操作で追加される。 |
| `UserVideoSetting` | ユーザー固有 | 各ユーザーの動画に対する設定（お気に入り・スキップ・メモ等）。インポート時に併せて作成される。 |

**インポート（追加）= `VideoBasicInfo` へのデータ登録**であり、サービス全体に対する操作である。
検索結果での「既存動画検知」は、この `VideoBasicInfo` の存在確認を基準とするべきであり、
`UserVideoSetting`（ユーザー設定）は関与しない。

---

## 実装方針

### 調査結果

- 検索 API（`/api/videos/search/route.ts`）は現在 `NiconicoVideoInfo[]` を返すのみで、
  動画の既登録状態を含まない
- `core` ライブラリには `batchGetVideoBasicInfo(videoIds)` が公開されており、
  複数の動画 ID に対して一括で `VideoBasicInfo` の存在確認ができる
- 各動画アイテムに `isRegistered: boolean` を直接埋め込んでサーバーから返すことで、
  クライアント側でのリスト参照・マッピング処理が不要になりシンプルになる

### 方針

**検索 API の拡張（サーバー側で登録済み判定）**

- `GET /api/videos/search` の各検索結果アイテムに `isRegistered: boolean` フィールドを追加する
- サーバー側で `batchGetVideoBasicInfo()` を呼び出し、各動画の登録済み状態を確定してから
  レスポンスに含める（クライアント側でのマッピング処理が不要）
- フロントエンド（`VideoSearchModal`）は各動画の `isRegistered` を参照し、
  `true` の場合は初期状態を `'already-added'` として表示する

**変更対象ファイル**

| ファイル | 変更内容 |
|---------|---------|
| `web/src/app/api/videos/search/route.ts` | 検索後に `batchGetVideoBasicInfo()` で既存動画を一括確認し、各動画に `isRegistered: boolean` を付与して返す |
| `web/src/components/VideoSearchModal.tsx` | 各動画の `isRegistered` を参照し `addStatusById` 初期値を設定 |
| `web/e2e/video-search.spec.ts` | 既登録動画が追加済み表示になるケースのテストを追加 |

---

## タスク

### フェーズ 1: API 拡張

- [ ] T001: `GET /api/videos/search` のレスポンス型を `(NiconicoVideoInfo & { isRegistered: boolean })[]` に変更する
- [ ] T002: `searchVideos()` 実行後、検索結果の動画 ID 群を `batchGetVideoBasicInfo()` で
      一括確認し、グローバル DB に存在する動画 ID のセットを作成する
- [ ] T003: 各動画アイテムに `isRegistered` フラグを付与してレスポンスに含める

### フェーズ 2: フロントエンド対応

- [ ] T004: `VideoSearchModal.tsx` の `handleSearch` 内で、各動画の `isRegistered` が `true` の場合に
      `addStatusById` の初期値を `'already-added'` に設定する処理を追加する

### フェーズ 3: テスト追加・更新

- [ ] T005: `web/e2e/video-search.spec.ts` に、既登録動画が検索結果で追加済み表示になる
      ケースの E2E テストを追加する（`USE_IN_MEMORY_DB` を活用）
- [ ] T006: カバレッジが 80% 以上であることを確認する

---

## 参考ドキュメント

- `docs/services/niconico-mylist-assistant/architecture.md` - DynamoDB 設計と Repository パターン
- `docs/services/niconico-mylist-assistant/requirements.md` - サービス要件
- `docs/development/rules.md` - コーディング規約

---

## 備考・未決定事項

- `batchGetVideoBasicInfo()` は DynamoDB の BatchGetItem を使った一括取得であり、
  検索件数（最大 10 件）に対して1リクエストで済むため、パフォーマンス上の問題は小さい
- 「追加済み」はユーザー固有の状態ではなく、サービス全体として動画がインポート済みか否かを示す
- E2E テスト環境変数 `USE_IN_MEMORY_DB=true` を使いテスト用に既登録動画を事前投入する
