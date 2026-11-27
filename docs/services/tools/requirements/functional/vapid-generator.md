---
sources: []
---

# VAPID キー生成

Web Push 通知に使う VAPID キーの、公開鍵と秘密鍵のペアを作る。ユースケースは[Web Push の鍵を作る](../use-cases/generate-vapid-keys.md)。

## 要件

- ボタンを押すたびに、新しい鍵のペアを作って表示できる
- 公開鍵と秘密鍵を、それぞれコピーできる ([共通の操作](common-actions.md))
- 作った鍵を、サーバーにもブラウザにも保存しない
- 鍵を作れなかったときは、その旨を示す
- 今の挙動は[VAPID キー生成ツール](../../specs/screen/vapid-generator.md)、[VAPID キー API](../../specs/api/vapid.md)、[VAPID キー](../../specs/term/vapid-key.md)にある

## やらないこと

なし
