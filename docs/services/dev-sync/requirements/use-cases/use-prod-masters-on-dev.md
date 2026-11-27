---
sources: []
---

# dev で prod と同じ共有マスタを使う

運営者が、dev で日常利用するときに、prod と同じ共有マスタ (niconico の動画基本情報、stock-tracker の取引所・銘柄) をそのまま使う。

## 前提

- 運営者が、dev でサービスを日常利用している ([dev 環境のデータ](../../../../platform/rules/dev-data.md))
- 使いたい共有マスタが、同期の対象に入っている ([同期の対象を足す](add-sync-target.md))

## 流れ

1. dev-sync が、定期に prod の共有マスタを dev へ写す ([同期](../functional/sync.md))
2. 運営者が、dev でサービスを開き、動画や取引所・銘柄を使う
3. prod で共有マスタが追加・変更・削除されると、次の同期で dev にも映る

## 結果

- dev で、prod と同じ共有マスタを選んで使える
- 運営者は、共有マスタを dev で作り直さずに済む

## 例外

- prod で共有マスタが変わった直後は、次の同期まで dev に映らない
- 同期が失敗したときは、dev に途中までの内容が残り、Admin に通知が届く ([同期](../functional/sync.md))
