---
id: share-together/term/invitation
title: 招待
kind: term
service: share-together
sources:
  - services/share-together/core/src/libs/group.ts
  - services/share-together/core/src/types/index.ts
sources_hash: f1fb96be225f2ec3100490c8042b402108ea9a345f3d506a8d2433e5764f5bf8
terms: [share-together/term/group-role]
related_cards: [share-together/flow/group-invitation, share-together/api/group-members, share-together/api/invitations, share-together/screen/invitations]
related_adr:
  - services/share-together/architecture.md#2.3 グループ招待通知をサービス内通知とした理由
---

# 招待

オーナーがほかの利用者をグループへ誘う記録。独立したデータではなく、状態が `PENDING` のメンバーシップとして持つ。

## 説明

| 状態 | 意味 |
|---|---|
| `PENDING` (招待中) | 招待された人の応答を待っている |
| `ACCEPTED` (承認済み) | 応じてメンバーになった |
| `REJECTED` (拒否済み) | 断った |

- 招待は、招待した日時の 24 時間後に期限が切れる。招待中のレコードは、期限の時刻に TTL で消えるが、削除は遅れる。そのため、期限切れの判定は削除を待たず、期限の時刻が今以前 (ちょうども含む) なら切れたものとする
- 期限切れの招待は、一覧に出さず、承認も拒否もできず (409 `INVITATION_EXPIRED`)、重複の判定にも人数の判定にも数えない。同じ相手に改めて招待すれば、残っている記録を上書きする
- 拒否済みの相手にも、改めて招待できる。上書きするとき、前の応答の日時は消す
- 応答 (承認・拒否) すると期限は外れ、記録は消えずに残る
- 招待の通知はメールを送らず、招待された人が [招待画面](../screen/invitations.md)を開いたときに読む (ヘッダーの件数を含む)

## 関連するカード

- [招待から参加までの経路](../flow/group-invitation.md)
- [グループの立場](./group-role.md)
