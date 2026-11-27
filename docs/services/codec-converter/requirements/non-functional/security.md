---
sources: []
---

# セキュリティ

Codec Converter 固有の保護の水準。XSS などの全体の方針は[セキュリティ](../../../../platform/rules/security.md)に従う。

## 要求水準

- 通信は、すべて HTTPS で行う
- 保存したデータは、暗号化する
- 動画を入れるバケットは非公開にし、ブラウザからの読み書きは署名付き URL だけで行う ([ストレージ](../../specs/resource/storage.md))
- ジョブのテーブルは、IAM のロールだけが触れる ([ジョブのデータ](../../specs/data/jobs.md))
- ジョブを見られる人の範囲は[匿名での利用](../functional/anonymous-access.md)に従う

## やらないこと

なし
