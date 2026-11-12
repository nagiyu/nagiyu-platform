---
id: quick-clip/term/highlight
title: 見どころとクリップの状態
kind: term
service: quick-clip
sources:
  - services/quick-clip/core/src/types.ts
  - services/quick-clip/core/src/mappers/highlight.mapper.ts
  - services/quick-clip/core/src/libs/highlight.service.ts
  - services/quick-clip/core/src/libs/highlight-extractor.service.ts
  - services/quick-clip/web/src/lib/server/highlight-recovery.ts
  - services/quick-clip/web/src/lib/highlight-edit-lock.ts
sources_hash: 9b65827b386faefdc6a11721a71da269719b3ec0bc4025385fbc0ead891b8dc5
related_cards: [quick-clip/api/highlights, quick-clip/batch/extract, quick-clip/batch/clip-regenerate, quick-clip/screen/highlights, quick-clip/term/job]
related_adr:
  - services/quick-clip/architecture.md#ADR-002
  - services/quick-clip/architecture.md#ADR-014
  - services/quick-clip/architecture.md#ADR-017
---

# 見どころとクリップの状態

動画の中で、見る価値が高いと判定された区間。1 件ごとに、採否と、切り出したクリップの状態を持つ。

## 説明

| 項目 | 内容 |
|---|---|
| `highlightId` | UUID v4。キーは `PK` が `JOB#{jobId}`、`SK` が `HIGHLIGHT#{highlightId}` |
| `order` | 1 から始まる番号。開始時刻の昇順で付く。画面では `#1` のように出す |
| `startSec`、`endSec` | 区間の開始と終了 (秒)。小数を持つことがある。更新では 0 以上の有限の数で、開始が終了より小さくなければならない |
| `source` | 抽出の根拠。`motion` (映像の変化)、`volume` (音量)、`emotion` (感情)、`both` (別々の根拠の区間が重なって 1 件になったもの) |
| `dominantEmotion` | 感情が根拠のときの、一番高い感情。`laugh`、`excite`、`touch`、`tension` |
| `status` | 採否。`unconfirmed` (未確認)、`accepted` (使える)、`rejected` (使えない)。抽出の直後は `unconfirmed` |
| `clipStatus` | クリップの状態 (下表) |
| `clipGeneratingStartedAt` | `GENERATING` にした時刻 (epoch ミリ秒)。止まった作り直しを見分けるために使い、古いデータにはない |
| `expiresAt` | ジョブと同じ期限。同じ時刻に自動で削除される |

- クリップの S3 キーは `outputs/{jobId}/clips/{highlightId}.mp4` で、保存はせずに導く
- 旧形式の小文字始まりの属性名も読む。必須項目が欠けたり、`source`、`status`、`clipStatus`、`dominantEmotion` が許可外の値だったりすると、読む側が例外にする

## クリップの状態

| `clipStatus` | 意味 | 変える主体 |
|---|---|---|
| `PENDING` | 切り出し前 | 抽出バッチが、見どころを組み立てる間だけ持つ。保存するときは `GENERATED` にするので、新しく抽出した見どころに `PENDING` は残らない |
| `GENERATING` | 作り直している最中 | [見どころ API](../api/highlights.md) が、開始・終了の更新かリトライの受付で設定する |
| `GENERATED` | 切り出し済みで、再生できる | [抽出バッチ](../batch/extract.md)が保存するとき。[クリップ再生成](../batch/clip-regenerate.md)が作り直しに成功したとき |
| `FAILED` | 作り直しに失敗した | クリップ再生成が失敗したとき。再生成の起動に失敗したとき。止まったままの `GENERATING` を API が見切ったとき |

- 同じ見どころの作り直しは同時に 1 件まで。`GENERATING` の間は、時刻の変更とリトライを API が 409 で断り、画面も開始・終了の入力とリトライを止める。採否の変更は止めない
- 作り直しの Lambda が強制終了すると `GENERATING` のまま残る。`clipGeneratingStartedAt` から 360 秒 (Lambda のタイムアウト 300 秒に、余裕の 60 秒を足した値) を過ぎたものは、止まったとみなして `FAILED` にする。`clipGeneratingStartedAt` がないデータは、対象にしない
- 開始か終了を変えると、採否が `accepted` か `rejected` なら `unconfirmed` に戻る

## 関連するカード

- [見どころ API](../api/highlights.md)・[抽出バッチ](../batch/extract.md)・[クリップ再生成](../batch/clip-regenerate.md)
- [見どころ確認画面](../screen/highlights.md)
- [ジョブとステータス](./job.md)
