---
id: livetalk/term/consent
title: 同意
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/lib/consent.ts
  - services/livetalk/core/src/constants.ts
  - services/livetalk/web/src/app/api/consent/route.ts
  - services/livetalk/web/src/lib/server/consent.ts
sources_hash: d6d6f5668980c85bb06e08273b221cb9655b810b444e82faf2c4cccb1032739e
related_cards: [livetalk/api/consent, livetalk/api/chat, livetalk/screen/home, livetalk/screen/terms, livetalk/screen/privacy]
related_adr:
  - services/livetalk/architecture.md#2.9
---

# 同意

利用者が、利用規約・プライバシーポリシー・18 歳以上であること (自己申告) に応じた記録。ホーム画面で会話を始める前に求める。

## 説明

- 記録するのは、規約の版と同意日時、プライバシーポリシーの版と同意日時、18 歳以上の自己申告と日時
- 有効と見なすのは、3 つがそろい、規約とプライバシーポリシーの版が今の版 (どちらも `1.1.0`) と一致するときだけ。版が上がると、再び求める
- 同意は利用者ごとに 1 件で、プロフィールに保存する。退会すると消える
- 求めるのはホーム画面の同意のダイアログで、同意するまで入力欄は無効のまま残る
- [チャット API](../api/chat.md) も、同意が有効でなければ会話を断る (403)。画面はそれを受けると、同意のダイアログを開き直す
- 会話以外の API (記憶・ノートの閲覧、通知、退会など) は、同意を確かめない

## 関連するカード

- [同意 API](../api/consent.md)
- [チャット API](../api/chat.md)
- [ホーム画面](../screen/home.md)
