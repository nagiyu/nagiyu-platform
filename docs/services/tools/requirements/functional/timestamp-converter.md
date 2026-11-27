---
sources: []
---

# タイムスタンプ変換

Unix タイムスタンプと日時の文字列を、選んだタイムゾーンで相互に変換する。ユースケースは[データを整形・変換してコピーする](../use-cases/convert-and-copy.md)。

## 要件

- Unix 秒と Unix ミリ秒を、日時に変換できる
- 日時の文字列を、Unix タイムスタンプに変換できる
- 変換に使うタイムゾーンを、選べる
- 結果をコピーできる ([共通の操作](common-actions.md))
- 入力が正しくないときは、その旨を示す
- 変換はブラウザの中で終わる ([プライバシー](../non-functional/privacy.md))
- 今の挙動は[タイムスタンプ変換ツール](../../specs/screen/timestamp-converter.md)にある

## やらないこと

なし
