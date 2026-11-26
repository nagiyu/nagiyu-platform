---
sources: []
---

# セキュリティ

dev-sync が prod を壊さないための水準。dev から prod への入口と、書き込みの先を絞る。

## 要求水準

- prod には読むだけにする。prod への書き込み権限を、どこにも発行しない
- コピー先は dev のテーブルに限る。合成時と実行時の両方で検査し、dev でないものは中止する。多層にする理由は [同期の実行環境](../../specs/resource/batch-runtime.md)にある
- prod への入口を、読み取り専用のロール 1 つに絞る。dev 側は、このロールを引き受ける権限だけを持ち、prod のテーブルを直接読む権限を持たない。絞る理由は [prod 読み取りロール](../../../../platform/specs/resource/dev-sync-source-reader.md)にある
- dev のアカウントを prod に依存させない。prod と dev をつなぐのは、dev-sync のデータのコピーだけにする ([AWS アカウントとアクセス](../../../../platform/rules/aws-accounts.md))

権限の中身は、[同期バッチ](../../specs/batch/sync.md)と [prod 読み取りロール](../../../../platform/specs/resource/dev-sync-source-reader.md)にある。

## やらないこと

なし
