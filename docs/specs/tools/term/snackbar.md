---
id: tools/term/snackbar
title: 通知バー (スナックバー)
kind: term
service: tools
sources:
  - services/tools/src/app/transit-converter/page.tsx
  - services/tools/src/app/json-formatter/JsonFormatterClient.tsx
  - services/tools/src/app/base64/Base64Client.tsx
  - services/tools/src/app/url-encoder/UrlEncoderClient.tsx
  - services/tools/src/app/hash-generator/HashGeneratorClient.tsx
  - services/tools/src/app/timestamp-converter/TimestampConverterClient.tsx
  - services/tools/src/app/vapid-generator/page.tsx
sources_hash: 8d0ba4f0039c7fefa92937170d8fc2d4952940bff5ca3b43f07cc3ab45995378
related_cards: [tools/screen/transit-converter, tools/screen/json-formatter, tools/screen/base64, tools/screen/url-encoder, tools/screen/hash-generator, tools/screen/timestamp-converter, tools/screen/vapid-generator]
---

# 通知バー (スナックバー)

各ツール画面で、操作の結果を一時的に知らせる、画面下の帯。

## 説明

| 項目 | 内容 |
|---|---|
| 位置 | 画面下の中央 |
| 消えるとき | 表示から 4,000ms で自動で消える。右端の「×」でも閉じる |
| 種別 | `success` (成功、緑)、`error` (失敗、赤)、`info` (案内)。`info` を使うのは、乗り換え変換ツールで共有されたデータを読み込んだときだけ |
| 同時に出る数 | 1 件。次の操作の結果で、内容が置き換わる |

- 入力の検証に外れたときは、通知バーに加えて、入力欄の赤枠と下の文でも同じメッセージを出す (タイムスタンプ変換ツールは、変換した欄だけに出す)。入力欄の表示は、次の操作で成功するか、クリアするまで残る
- クリップボードの失敗と、VAPID キーの生成の失敗は、通知バーだけに出る
- 文言は画面ごとに決まっていて、各画面のカードにある

## 関連するカード

- [乗り換え変換ツール](../screen/transit-converter.md)・[JSON 整形ツール](../screen/json-formatter.md)・[Base64 エンコーダー / デコーダー](../screen/base64.md)・[URL エンコーダー / デコーダー](../screen/url-encoder.md)・[ハッシュ生成ツール](../screen/hash-generator.md)・[タイムスタンプ変換ツール](../screen/timestamp-converter.md)・[VAPID キー生成ツール](../screen/vapid-generator.md)
- [クリップボード操作](./clipboard-actions.md)
