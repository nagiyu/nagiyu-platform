---
id: tools/term/clipboard-actions
title: クリップボード操作
kind: term
service: tools
sources:
  - libs/browser/src/clipboard.ts
  - services/tools/src/app/transit-converter/page.tsx
  - services/tools/src/app/json-formatter/JsonFormatterClient.tsx
  - services/tools/src/app/base64/Base64Client.tsx
  - services/tools/src/app/url-encoder/UrlEncoderClient.tsx
  - services/tools/src/app/hash-generator/HashGeneratorClient.tsx
  - services/tools/src/app/timestamp-converter/TimestampConverterClient.tsx
  - services/tools/src/app/vapid-generator/page.tsx
sources_hash: 98166e16ab9e8b1c81ccef2da622f193c6a19e401008a7494911c038a9467cef
terms: [tools/term/snackbar]
related_cards: [tools/screen/transit-converter, tools/screen/json-formatter, tools/screen/base64, tools/screen/url-encoder, tools/screen/hash-generator, tools/screen/timestamp-converter, tools/screen/vapid-generator]
---

# クリップボード操作

ツール画面の「クリップボードから読み取り」と「コピー」。ブラウザの Clipboard API で、端末のクリップボードを読み書きする。

## 説明

| 操作 | 成功したとき | 失敗したとき |
|---|---|---|
| 読み取り | 入力欄を、読み取った文字列に置き換える。入力欄のエラー表示を消す。[通知バー](./snackbar.md)に「クリップボードから読み取りました」 (成功) | 「クリップボードの読み取りに失敗しました。手動で貼り付けてください。」を通知バー (失敗) に出す。入力欄は変わらない |
| コピー | 結果をクリップボードに書く。通知バーに「クリップボードにコピーしました」 (成功) | 「コピーに失敗しました」を通知バー (失敗) に出す |

- 失敗には、ブラウザが Clipboard API を持たない場合と、ブラウザが許可しなかった場合の両方が入る。理由は区別しない
- 「コピー」は、コピーするものがあるときだけ押せる。読み取りは、画面にいつも出ていて押せる
- 読み取りがあるのは、乗り換え変換・JSON 整形・Base64・URL・ハッシュの 5 画面。タイムスタンプ変換と VAPID キー生成にはない
- コピーするもの

| 画面 | コピーするもの |
|---|---|
| 乗り換え変換・JSON 整形・Base64・URL・ハッシュ | 出力欄の文字列そのまま |
| タイムスタンプ変換 | 変換結果を 5 行にまとめたテキスト (タイムゾーン、日時、UTC (ISO 8601)、Unix 秒、Unix ミリ秒)。成功の文言は「変換結果をクリップボードにコピーしました」 |
| VAPID キー生成 | 押した側の鍵 (公開鍵か秘密鍵) |

## 関連するカード

- [乗り換え変換ツール](../screen/transit-converter.md)・[JSON 整形ツール](../screen/json-formatter.md)・[Base64 エンコーダー / デコーダー](../screen/base64.md)・[URL エンコーダー / デコーダー](../screen/url-encoder.md)・[ハッシュ生成ツール](../screen/hash-generator.md)・[タイムスタンプ変換ツール](../screen/timestamp-converter.md)・[VAPID キー生成ツール](../screen/vapid-generator.md)
