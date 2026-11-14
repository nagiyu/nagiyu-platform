---
id: livetalk/term/consent
title: 同意
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/lib/consent.ts
  - services/livetalk/core/src/constants.ts
  - services/livetalk/web/src/app/api/consent/route.ts
sources_hash: eda792d6d5a70cce8b39ad9dd53debbf56bedb59920de0d6adeffe6cffa8a0f2
related_cards: [livetalk/api/consent, livetalk/screen/home, livetalk/screen/terms, livetalk/screen/privacy]
related_adr:
  - services/livetalk/architecture.md#2.9
---

# 同意

利用者が、利用規約・プライバシーポリシー・18 歳以上であること (自己申告) に応じた記録。ホーム画面で会話を始める前に求める。

## 説明

- 記録するのは、規約の版と同意日時、プライバシーポリシーの版と同意日時、18 歳以上の自己申告と日時
- 有効と見なすのは、3 つがそろい、規約とプライバシーポリシーの版が今の版 (どちらも `1.1.0`) と一致するときだけ。版が上がると、再び求める
- 同意は利用者ごとに 1 件で、プロフィールに保存する。退会すると消える
- 同意していなくても、会話の API は拒まない。求めるのはホーム画面の同意のダイアログで、入力欄が無効のまま残る

## 関連するカード

- [同意 API](../api/consent.md)
- [ホーム画面](../screen/home.md)
