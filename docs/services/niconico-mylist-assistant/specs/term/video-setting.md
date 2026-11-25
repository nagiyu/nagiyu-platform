---
sources:
  - services/niconico-mylist-assistant/core/src/entities/user-setting.entity.ts
  - services/niconico-mylist-assistant/core/src/mappers/user-setting.mapper.ts
  - services/niconico-mylist-assistant/core/src/db/videos.ts
sources_hash: 9483eea2001accc2d2049a367d56c8e680408b6d12a7c1b2e24224c614605329
---

# ユーザー設定 (お気に入り・スキップ・メモ)

動画に対して利用者が個別に付ける印。動画そのものの情報 ([動画基本情報](./video-basic-info.md)) とは別に、利用者ごとに持つ。

## 説明

| 項目 | 内容 |
|---|---|
| お気に入り (`isFavorite`) | マイリストの登録条件「お気に入りのみ」で使う |
| スキップ (`isSkip`) | マイリストの登録条件「スキップ動画を除外する」で使う。一覧では薄く表示する |
| メモ (`memo`) | 自由な文章。1000 文字以内 |

- 動画 (利用者 ID と動画 ID の組) ごとに 1 件。設定の保存先は動画基本情報とは別の項目で、他の利用者の設定は見えない
- 設定がない動画は、お気に入りでもスキップでもないものとして扱う。絞り込みでも登録対象の選択でも同じ
- 設定は、動画を取り込むとき (お気に入りもスキップも `false`) と、画面から設定を変えたときに作られる。設定がない動画へ変更を送ると、足りない項目を `false` として新しく作る
