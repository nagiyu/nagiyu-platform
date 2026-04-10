---
title: "H.264・VP9・AV1のコーデック比較と使い分け"
description: "動画コーデックH.264・VP9・AV1の詳細比較。圧縮効率・ブラウザサポート・エンコード速度・画質・用途ごとの使い分けをFFmpegのコマンド例とともに解説します。"
slug: "video-codec-comparison"
publishedAt: "2026-04-10"
tags: ["動画", "コーデック", "H.264", "AV1"]
---

## はじめに

動画ファイルを扱う際、コーデックの選択は画質・ファイルサイズ・互換性に大きく影響します。本記事では、現在 Web において主流の 3 つのコーデック「H.264」「VP9」「AV1」を詳しく比較し、用途に応じた使い分けを解説します。

## 各コーデックの概要

### H.264（AVC）

H.264（Advanced Video Coding）は、2003 年に標準化された動画コーデックで、現在最も広く普及しています。ほぼすべてのデバイス・ブラウザ・プレーヤーで対応しており、ハードウェアエンコード・デコードにも広く対応しています。

**特徴**
- 最高の互換性（ほぼすべてのデバイスで再生可能）
- 高速なエンコード・デコード
- ハードウェアアクセラレーション対応が豊富
- 特許ライセンスが必要（商用利用時に費用が発生する場合あり）

### VP9

VP9 は Google が開発した動画コーデックで、2013 年にリリースされました。H.264 に比べて約 50% 高い圧縮効率を持ち、YouTube での採用で広く知られています。ロイヤリティフリーのオープンコーデックです。

**特徴**
- H.264 比で約 30〜50% 高い圧縮効率
- ロイヤリティフリー
- Chrome・Firefox・Edge で広くサポート
- エンコード速度は H.264 より遅い
- 4K・8K コンテンツにも対応

### AV1

AV1 は Alliance for Open Media（AOMedia）が開発した最新世代のオープンコーデックで、2018 年にリリースされました。VP9 比でさらに 30% 以上の圧縮効率向上を実現しており、Netflix・YouTube・YouTube TV など主要ストリーミングサービスで採用が進んでいます。

**特徴**
- 最高水準の圧縮効率（VP9 比で約 30〜50% 削減）
- ロイヤリティフリー
- 主要ブラウザのサポートが急速に進んでいる
- エンコード時間が非常に長い（CPU コストが高い）
- ハードウェアデコード対応は増加中

## コーデック比較表

| 項目 | H.264 | VP9 | AV1 |
|------|-------|-----|-----|
| リリース年 | 2003 | 2013 | 2018 |
| 圧縮効率 | ★★☆ | ★★★ | ★★★★ |
| エンコード速度 | ★★★★ | ★★★ | ★☆☆ |
| デコード速度 | ★★★★ | ★★★ | ★★★ |
| ブラウザ対応 | ほぼ全対応 | 主要ブラウザ | 主要ブラウザ（近年） |
| ライセンス | 特許あり | フリー | フリー |
| HWエンコード | ほぼ全対応 | 一部対応 | 増加中 |

## 圧縮効率の比較

同等の視覚品質を実現するために必要なビットレートの比較です。

```
H.264 (CRF 23): 1080p 映画 = 約 8 Mbps
VP9  (CRF 33): 同等品質  = 約 5 Mbps（H.264比 -37%）
AV1  (CRF 28): 同等品質  = 約 3.5 Mbps（H.264比 -56%）
```

ストリーミング配信においては、AV1 によるビットレート削減は帯域コストの大幅な削減に直結します。

## FFmpeg を使ったエンコードコマンド

### H.264（libx264）

```bash
# 標準的なH.264エンコード
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k output_h264.mp4

# 高品質（CRF値を下げるほど高品質・ファイルサイズ増）
ffmpeg -i input.mp4 -c:v libx264 -crf 18 -preset slow -c:a aac -b:a 192k output_h264_hq.mp4

# ストリーミング向け（faststart オプション）
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -preset medium -movflags +faststart output_h264_stream.mp4
```

### VP9（libvpx-vp9）

```bash
# VP9エンコード（2パスエンコード推奨）
ffmpeg -i input.mp4 -c:v libvpx-vp9 -b:v 0 -crf 33 -pass 1 -an -f webm /dev/null
ffmpeg -i input.mp4 -c:v libvpx-vp9 -b:v 0 -crf 33 -pass 2 -c:a libopus -b:a 128k output_vp9.webm

# 速度優先（speed オプション: 0が最高品質、8が最速）
ffmpeg -i input.mp4 -c:v libvpx-vp9 -crf 33 -b:v 0 -speed 4 -c:a libopus output_vp9_fast.webm
```

### AV1（libaom-av1 / libsvtav1）

```bash
# AV1エンコード（libaom-av1 - 低速だが高品質）
ffmpeg -i input.mp4 -c:v libaom-av1 -crf 28 -b:v 0 -c:a libopus output_av1.webm

# SVT-AV1（高速なAV1エンコード - Netflixが開発）
ffmpeg -i input.mp4 -c:v libsvtav1 -crf 28 -preset 6 -c:a libopus output_svtav1.webm

# AV1 + MP4コンテナ（isoavif形式）
ffmpeg -i input.mp4 -c:v libaom-av1 -crf 28 -c:a aac output_av1.mp4
```

## ブラウザサポート状況

### HTML5 Video での再生対応

```html
<!-- ブラウザ対応を最大化するためにフォールバックを用意する -->
<video controls>
  <source src="video.av1.webm" type="video/webm; codecs=av01.0.05M.08">
  <source src="video.vp9.webm" type="video/webm; codecs=vp9">
  <source src="video.h264.mp4" type="video/mp4; codecs=avc1.42E01E">
  <p>お使いのブラウザは動画再生に対応していません。</p>
</video>
```

| ブラウザ | H.264 | VP9 | AV1 |
|--------|-------|-----|-----|
| Chrome 100+ | ✅ | ✅ | ✅ |
| Firefox 100+ | ✅ | ✅ | ✅ |
| Safari 16+ | ✅ | ✅ | ✅ macOS 13+ |
| Edge 100+ | ✅ | ✅ | ✅ |
| iOS Safari 16+ | ✅ | ❌ | ❌（一部対応） |

iOS Safari での VP9・AV1 サポートが限定的なため、iOS ユーザーを意識する場合は H.264 フォールバックが必須です。

## 用途別の推奨コーデック

### 一般的な Web 動画配信
**推奨: H.264 + VP9 フォールバック**

最大の互換性が必要な場合は H.264 を第一選択にしつつ、VP9 バージョンも用意してブラウザ対応に応じて切り替えます。

### ストリーミング配信（Netflix・YouTube 型）
**推奨: AV1（フォールバック: VP9 → H.264）**

帯域コストを最小化したい場合は AV1 が最適です。エンコード時間は長いですが、一度エンコードしたら何度も配信するコンテンツには投資対効果が高い選択です。

### リアルタイム配信・WebRTC
**推奨: H.264 または VP9**

AV1 はエンコード遅延が大きいため、リアルタイム配信には不向きです。ハードウェアエンコード対応が豊富な H.264 か、オープンコーデックで対応が進む VP9 を選択します。

### 動画のアーカイブ・長期保存
**推奨: H.265（HEVC）または AV1**

長期保存用には圧縮効率の高いコーデックが適しています。H.265 はハードウェア対応が豊富で、AV1 は将来的な互換性に優れています。

## エンコード時間の目安

1 時間の 1080p 動画（CPU エンコード）の処理時間比較

```
H.264 (preset: medium) : 約 30 分
VP9 (speed: 4)         : 約 60 分
AV1 (libaom, cpu-used 4) : 約 8〜24 時間
AV1 (SVT-AV1, preset 6) : 約 30〜60 分
```

AV1 のエンコード時間の長さは大きなボトルネックになりますが、SVT-AV1 を使うことで実用的な速度に改善されます。AWS Batch などのクラウドサービスを活用して並列処理を行うと、大量のコンテンツの変換も現実的な時間内に完了できます。

## まとめ

- **H.264**: 最高の互換性。特に iOS や古いデバイスを考慮する場合は必須
- **VP9**: H.264 比で高圧縮、ロイヤリティフリー。Web 配信の標準的な選択肢
- **AV1**: 最高の圧縮効率。帯域コストを重視するストリーミングサービスに最適

コーデック選択は「互換性」「圧縮効率」「エンコード速度」のトレードオフです。ユーザー環境と配信コストのバランスを考慮して最適なコーデックを選択してください。
