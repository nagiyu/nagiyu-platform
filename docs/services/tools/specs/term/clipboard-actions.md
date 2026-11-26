---
sources:
  - services/tools/src/app/transit-converter/page.tsx
  - services/tools/src/app/json-formatter/JsonFormatterClient.tsx
  - services/tools/src/app/base64/Base64Client.tsx
  - services/tools/src/app/url-encoder/UrlEncoderClient.tsx
  - services/tools/src/app/hash-generator/HashGeneratorClient.tsx
  - services/tools/src/app/timestamp-converter/TimestampConverterClient.tsx
  - services/tools/src/app/vapid-generator/page.tsx
sources_hash: 8d0ba4f0039c7fefa92937170d8fc2d4952940bff5ca3b43f07cc3ab45995378
---

# クリップボード操作

ツール画面の「クリップボードから読み取り」と「コピー」。ブラウザの Clipboard API で、端末のクリップボードを読み書きする。API の呼び方と失敗の扱いは[クリップボード](../../../../platform/specs/lib/browser/clipboard.md)にある。全ツールで操作と通知をそろえる要件は[共通の操作](../../requirements/functional/common-actions.md)にある。

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

## 理由

- ボタンを押したときだけ読み書きする。Clipboard API は、ユーザーの明示的な操作 (クリックなど) がないと使えないため
