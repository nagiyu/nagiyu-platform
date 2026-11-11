---
id: tools/screen/url-encoder
title: URL エンコーダー / デコーダー
kind: screen
service: tools
sources:
  - services/tools/src/app/url-encoder/UrlEncoderClient.tsx
  - services/tools/src/lib/url-encoder.ts
  - libs/browser/src/clipboard.ts
sources_hash: 6d83780d10b99f8aa5f211fc3c291a7642187812adca1ecaaac08e1147d0aac4
terms: [tools/term/snackbar, tools/term/clipboard-actions, tools/term/migration-dialog]
related_cards: [tools/screen/home, tools/screen/base64]
related_adr:
  - services/tools/tools-catalog.md#ツール一覧
  - services/tools/requirements.md#フェーズ3: 追加ツール（実装済み）
---

# URL エンコーダー / デコーダー

文字列を URL エンコード (パーセントエンコード) し、URL エンコードされた文字列を元に戻す画面。変換はブラウザの中で終わり、入力は外へ送らない。ログインは要らない。

## 入口

- パスは `/url-encoder`
- [ツール一覧画面](./home.md)のカードと、ヘッダーのタイトル・ナビゲーションから来る (ヘッダーは全画面共通)

## 表示の条件

- 初回の訪問では、[初回訪問ダイアログ](../term/migration-dialog.md)が前面に出て、閉じるまでこの画面は操作できない

## 表示するもの

上から次の順に並ぶ。ヘッダーとフッターは全画面共通で、[ツール一覧画面](./home.md)に書いてある。

| 部分 | 内容 |
|---|---|
| 見出し | 「URL エンコーダー / デコーダー」と、使い方の説明 |
| モード | 「エンコード」「デコード」の 2 つのボタン。選んでいるほうが塗りつぶし。初めは「エンコード」 |
| 入力 | 複数行 (8 行) の入力欄と、「クリップボードから読み取り」、変換のボタン (モードの名前) |
| 出力 | 読み取り専用の複数行 (8 行)「結果」と、「コピー」「クリア」 |

モードで変わる文言。

| 部分 | エンコード | デコード |
|---|---|---|
| 入力欄のラベル | テキスト | URLエンコード文字列 |
| 変換のボタン | エンコード | デコード |
| 成功の通知 | URLエンコードしました | URLデコードしました |

## 状態

- 初めは変換のボタン、「コピー」、「クリア」が押せない。変換のボタンは入力が空白だけのとき、「コピー」は出力が空のとき、「クリア」は入力も出力も空のときに押せない
- モードを切り替えると、出力とエラーを消す。入力は残る
- 変換に失敗すると、[通知バー](../term/snackbar.md) (失敗) と、入力欄の赤枠と下の文に出す。出力は前の結果のまま残る。エラーは、次に成功するか、モードの切り替えか、「クリア」か、「クリップボードから読み取り」で消える

| モード | 失敗の条件 | メッセージ |
|---|---|---|
| エンコード | 対になっていないサロゲート文字を含むなど、エンコードできない | URLエンコードに失敗しました。 |
| デコード | `%` の並びが正しくない (`%` のあとが 16 進数 2 桁でないなど) | URLデコードに失敗しました。 |

## 変換のしかた

- エンコード: JavaScript の `encodeURIComponent` で変換する。英数字と `- _ . ! ~ * ' ( )` 以外は、`:` `/` `?` `#` `&` `=` や空白 (`%20`) も含めて `%XX` にする。入力の前後の空白もそのまま変換する
- デコード: 入力の前後の空白を除いてから、`decodeURIComponent` で戻す。`+` は空白にならず、`+` のまま残る

## 操作

| 操作 | 結果 |
|---|---|
| 「エンコード」「デコード」 (モード) | モードを切り替える。出力とエラーを消す |
| 「クリップボードから読み取り」 | [クリップボード操作](../term/clipboard-actions.md)のとおり、入力欄を置き換える |
| 変換のボタン | 上のとおり変換して、出力欄に入れる |
| 「コピー」 | 出力欄の文字列を[クリップボードへ書く](../term/clipboard-actions.md) |
| 「クリア」 | 入力・出力・エラーを消す。モードは変えない |

API は呼ばない。

## 画面の見た目

### 通常表示

エンコードモード。入力前。

| スマホ | PC |
|---|---|
| ![URL エンコーダー / デコーダー 通常表示 (スマホ)](../../../images/specs/tools/screen/url-encoder-default-mobile.png) | ![URL エンコーダー / デコーダー 通常表示 (PC)](../../../images/specs/tools/screen/url-encoder-default-desktop.png) |

### エンコードした

日本語の文字列をエンコードした例。「URLエンコードしました」を出す。

| スマホ | PC |
|---|---|
| ![URL エンコーダー / デコーダー エンコードした (スマホ)](../../../images/specs/tools/screen/url-encoder-encoded-mobile.png) | ![URL エンコーダー / デコーダー エンコードした (PC)](../../../images/specs/tools/screen/url-encoder-encoded-desktop.png) |

### デコードに失敗したとき

デコードモードで、末尾が `%` で終わる文字列を入れた例。「URLデコードに失敗しました。」を出す。

| スマホ | PC |
|---|---|
| ![URL エンコーダー / デコーダー デコードに失敗したとき (スマホ)](../../../images/specs/tools/screen/url-encoder-decode-error-mobile.png) | ![URL エンコーダー / デコーダー デコードに失敗したとき (PC)](../../../images/specs/tools/screen/url-encoder-decode-error-desktop.png) |

## つながり

```mermaid
flowchart TD
    H[ツール一覧画面] --> U[URL エンコーダー / デコーダー]
    U --> C[クリップボード]
```
