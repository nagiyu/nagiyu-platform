---
sources:
  - services/niconico-mylist-assistant/web/src/lib/video-id-input.ts
  - services/niconico-mylist-assistant/web/src/app/api/videos/bulk-import/route.ts
  - services/niconico-mylist-assistant/core/src/niconico/constants.ts
sources_hash: 64ea9a134f951758598169eacf5d0c60aacaaec967feb293e78de2bfa00f0034
---

# 動画 ID

ニコニコ動画の動画を指す識別子。英字の接頭辞と数字でできている (`sm9`、`so12345`、`nm98765`)。このサービスの動画のキーでもある。

## 説明

- サーバーが受け付ける形は、小文字の英字 1 文字以上と数字 1 文字以上 (`/^[a-z]+\d+$/`)。大文字や記号を含むものは形式不正として断る
- 動画の検索結果から取り出す ID は、接頭辞が `sm`、`nm`、`so` のものだけ
- インポート画面は、入力を次のように整えてから送る。整えても形に合わないものは、入力のままサーバーへ送り、サーバーが形式不正として返す

| 整え方 | 内容 |
|---|---|
| 区切り | 改行、空白、`,`、`、`、`，`、全角空白 |
| URL からの取り出し | `nicovideo.jp/watch/` と `nico.ms/` (`nico.ms/watch/` も) の URL から ID を取り出す。`https://` は省略でき、`www` や `sp` などのサブドメインも付いてよい |
| 小文字化 | 英字と数字の形のものは小文字にする |
