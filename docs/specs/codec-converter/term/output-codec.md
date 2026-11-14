---
id: codec-converter/term/output-codec
title: 出力コーデック
kind: term
service: codec-converter
sources:
  - services/codec-converter/core/src/types.ts
  - services/codec-converter/core/src/constants.ts
  - services/codec-converter/batch/src/index.ts
  - services/codec-converter/web/src/app/page.tsx
sources_hash: 6026f4e2006cc11f32824b47b97cd0cccbbe9f8b3eaf7b5c0a9c7682cb1a562b
related_cards: [codec-converter/api/jobs, codec-converter/batch/convert, codec-converter/screen/upload, codec-converter/screen/job-detail, codec-converter/term/job-definition-size]
---

# 出力コーデック

変換後の動画の形式。利用者が[アップロード画面](../screen/upload.md)で 1 つ選ぶ。`h264`、`vp9`、`av1` の 3 種類で、入力は MP4 だけ。

## 説明

| 値 | 画面の表示 | 動画 | 音声 | 品質 | コンテナ |
|---|---|---|---|---|---|
| `h264` | H.264 - 互換性重視 (MP4) | `libx264` | `aac` | `-crf 23` | `mp4` |
| `vp9` | VP9 - バランス型 (WebM) | `libvpx-vp9` | `libopus` | `-crf 30` | `webm` |
| `av1` | AV1 - 高圧縮率 (WebM) | `libaom-av1` | `libopus` | `-crf 30 -cpu-used 4` | `webm` |

- 既定は `h264`
- 音声のビットレートは指定せず、FFmpeg の既定に任せる
- 出力の S3 キーの拡張子はコンテナで決まる (`h264` は `.mp4`、それ以外は `.webm`)
- ジョブのコーデックによって、Batch の[ジョブ定義のサイズ](./job-definition-size.md)も変わる

## 関連するカード

- [ジョブ API](../api/jobs.md)・[変換バッチ](../batch/convert.md)
- [アップロード画面](../screen/upload.md)・[ジョブ詳細画面](../screen/job-detail.md)
