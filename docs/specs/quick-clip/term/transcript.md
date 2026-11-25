---
id: quick-clip/term/transcript
title: 文字起こし
kind: term
service: quick-clip
sources:
  - services/quick-clip/core/src/libs/transcription.service.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/transcript/route.ts
  - services/quick-clip/web/src/app/jobs/[jobId]/highlights/page.tsx
  - services/quick-clip/lambda/zip/src/handler.ts
sources_hash: 51456368bcf19c9aaa846f635fc8653bacb2deea9aff0d18510cf8fa64e388f1
related_cards: [quick-clip/batch/extract, quick-clip/batch/zip-generate, quick-clip/api/transcript, quick-clip/screen/highlights, quick-clip/term/ai-analysis]
related_adr:
  - services/quick-clip/architecture.md#ADR-015
---

# 文字起こし

動画の音声を、時刻つきの行にしたもの。[AI 解析](./ai-analysis.md)でできる。見どころ確認画面で見どころごとに出し、ZIP にも入れる。

## 説明

- 1 行は `{ start, end, text }`。`start` と `end` は動画の先頭からの秒
- 1 行以上あるときだけ、S3 の `outputs/{jobId}/transcript.json` に保存する。0 行のとき、AI 解析をしなかったときは、ファイルを作らない。保存の失敗は、警告のログだけで処理を続ける
- 見どころの区間に重なる行は、`start` が見どころの終了より前で、`end` が見どころの開始より後の行。境界で接するだけの行は重ならない
    - 見どころ確認画面は、選んだ見どころの重なる行を改行で並べて出す。重なる行がなければ出さない。時刻を調整すると、重なる行も変わる
    - [ZIP の生成](../batch/zip-generate.md)は、重なる行を改行でつないだテキストを `clip-NN.txt` にして入れる。空なら入れない
- 1 行は、音声を無音で区切った 1 区間にあたる ([抽出バッチ](../batch/extract.md)の④)。`start` と `end` は区間の端で、話し始めと話し終わりの時刻とは限らない。無音が少ない動画では、1 行が最長 30 秒になる
- 無音の区間は送らない。テキストが空の区間は行にしない。文字起こしの結果の信頼度による行の除外はしない (モデルが信頼度を返さないため)
- ファイルは、生成したクリップと同じく作成の 24 時間後に消える

## 関連するカード

- [抽出バッチ](../batch/extract.md)・[ZIP 生成](../batch/zip-generate.md)
- [文字起こし API](../api/transcript.md)・[見どころ確認画面](../screen/highlights.md)
- [AI 解析](./ai-analysis.md)
