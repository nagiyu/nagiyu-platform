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
  - services/livetalk/web/src/lib/consent/notice.ts
sources_hash: 7660f7cf2030b3c74c13b2d5dc93f3964e38f870bde1cd25eaf36ce2c910f01d
related_cards: [livetalk/api/consent, livetalk/api/chat, livetalk/screen/home, livetalk/screen/terms, livetalk/screen/privacy]
related_adr:
  - services/livetalk/architecture.md#2.9
---

# 同意

利用者が、利用規約・プライバシーポリシー・18 歳以上であること (自己申告) に応じた記録。ホーム画面で会話を始める前に求める。

## 説明

- 記録するのは、規約の版と同意日時、プライバシーポリシーの版と同意日時、18 歳以上の自己申告と日時
- 同意を取り直しても、今の版に同意済みの文書と、記録済みの 18 歳以上の自己申告は、記録した日時のまま残る
- 有効と見なすのは、3 つがそろい、規約とプライバシーポリシーの版が今の版 (どちらも `1.1.0`) と一致するときだけ。版が上がると、再び求める
- 規約・ポリシーの同意が (前の版のものも含めて) 記録に残っている利用者に、版が上がったあとで求めるときは「改定」として扱う。画面は、変わった文書の改定の要点を示し、記録済みの 18 歳以上の自己申告は求め直さない。記録がなければ「初回」として扱う
- 同意は利用者ごとに 1 件で、プロフィールに保存する。退会すると消える
- 求めるのはホーム画面の同意のダイアログで、同意するまで入力欄は無効のまま残る
- [チャット API](../api/chat.md) も、同意が有効でなければ会話を断る (403)。画面はそれを受けると、同意のダイアログを開き直す
- 会話以外の API (記憶・ノートの閲覧、通知、退会など) は、同意を確かめない

## 関連するカード

- [同意 API](../api/consent.md)
- [チャット API](../api/chat.md)
- [ホーム画面](../screen/home.md)
