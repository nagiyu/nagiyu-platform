---
sources: []
---

# dev-sync

prod の DynamoDB のデータを dev 環境へ写す、プラットフォーム共通の同期の仕組み。dev を日常利用の場にしたときに、prod が正のデータを dev で使えるようにする。

## 解決したい課題

dev を日常利用の場 (ドッグフーディング) にして、prod を壊さない場所にする。この方針とデータの出自の分類は、[dev 環境のデータ](../../../platform/rules/dev-data.md)にある。

prod が正のデータ (共有マスタ。今は niconico の動画基本情報、stock-tracker の取引所・銘柄) は、dev に無いと使えない。このサービスは、そうしたデータを prod から dev へ写す。

## 扱わない範囲

- **dev から prod への書き込み**: しない。理由は [セキュリティ](non-functional/security.md) にある
- **prod が正でないデータの同期**: 写すデータの範囲は [dev 環境のデータ](../../../platform/rules/dev-data.md)の分類による。個人データを写さないことは [同期](functional/sync.md) にある
