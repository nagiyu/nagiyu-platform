---
sources:
  - services/niconico-mylist-assistant/core/src/entities/video.entity.ts
  - services/niconico-mylist-assistant/core/src/mappers/video.mapper.ts
  - services/niconico-mylist-assistant/core/src/db/videos.ts
sources_hash: 74fe9300dda789ef08e8fe5f5114604d14fdf9a7fe72990355474229fbc1785e
---

# 動画基本情報

ニコニコ動画から取得した動画のメタデータ。全利用者で共有し、動画 ID ごとに 1 件だけ持つ。利用者ごとの印は[ユーザー設定](./video-setting.md)に分けてある。

## 説明

| 項目 | 内容 |
|---|---|
| `videoId` | [動画 ID](./video-id.md) |
| `title` | タイトル |
| `thumbnailUrl` | サムネイルの URL |
| `length` | 長さ。`分:秒` (秒は 2 桁)。取り込み時に動画の秒数から作る。時間は分に含める (75 分 3 秒は `75:03`)。秒数が取れなければ `0:00` |
| `createdAt` | このサービスに登録した日時 |

- 保存先は[単一テーブル](../data/main-table.md)で、動画一覧の並びは `createdAt` の新しい順
- 動画の一覧は、この動画基本情報を起点にして、利用者のユーザー設定を重ねて作る。動画基本情報を消すと、他の利用者のユーザー設定が残っていても一覧には出ない
- 本番のこのデータは、定期的に dev 環境へ複写される ([同期バッチ](../../../../specs/dev-sync/batch/sync.md))
