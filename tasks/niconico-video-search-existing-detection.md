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

## 実装方針

### 調査結果

- 検索 API（`/api/videos/search/route.ts`）は現在 `NiconicoVideoInfo[]` を返すのみで、
  ユーザー固有の登録状態を含まない
- 追加 API（`/api/videos/bulk-import/route.ts`）では `getUserVideoSetting()` を呼び出して
  既登録チェックを実施済みであり、同じロジックを検索時にも適用できる
- `VideoSearchModal.tsx` の `addStatusById` ステートに検索時点で初期値を設定することで、
  フロントエンド側の変更は最小限に抑えられる

### 方針

**検索 API の拡張（最小変更アプローチ）**

- `GET /api/videos/search` レスポンスに `existingVideoIds: string[]` フィールドを追加する
- 検索動画の取得後、`getUserVideoSetting()` を各動画 ID に対して並行実行し、
  既登録の動画 ID 一覧を取得する
- フロントエンド（`VideoSearchModal`）は `existingVideoIds` を受け取り、
  検索完了後に `addStatusById` の初期値として `'already-added'` ステータスを設定する

**変更対象ファイル**

| ファイル | 変更内容 |
|---------|---------|
| `web/src/app/api/videos/search/route.ts` | 検索後に `getUserVideoSetting()` を並行実行し `existingVideoIds` を返す |
| `web/src/components/VideoSearchModal.tsx` | 検索結果受信後に `existingVideoIds` で `addStatusById` を初期化 |
| `web/e2e/video-search.spec.ts` | 既登録動画が追加済み表示になるケースのテストを追加 |

---

## タスク

### フェーズ 1: API 拡張

- [ ] T001: `GET /api/videos/search` のレスポンス型に `existingVideoIds: string[]` を追加する
- [ ] T002: `searchVideos()` 実行後、セッションのユーザー ID と検索結果の動画 ID 群で
      `getUserVideoSetting()` を `Promise.all` で並行実行し、登録済み ID を収集する
- [ ] T003: 収集した登録済み ID を `existingVideoIds` としてレスポンスに含める

### フェーズ 2: フロントエンド対応

- [ ] T004: `VideoSearchModal.tsx` の `handleSearch` 内で、`existingVideoIds` を受け取ったら
      `addStatusById` の初期値に `'already-added'` を設定する処理を追加する

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

- 検索結果が最大 10 件であるため、`getUserVideoSetting()` の並行呼び出しは最大 10 回であり
  パフォーマンス上の問題は小さいと判断する
- 将来的に検索件数が増える場合は、`listUserVideoSettings()` で全件取得し
  フロントエンドでフィルタリングする方式も検討余地がある
- E2E テスト環境変数 `USE_IN_MEMORY_DB=true` を使いテスト用に既登録動画を事前投入する
