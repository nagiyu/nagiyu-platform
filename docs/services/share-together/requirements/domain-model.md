---
sources: []
---

# ドメインモデル

利用者が個人リストで ToDo を管理し、グループを作って人を招き、承認したメンバーと共有リストで ToDo を分け合うまでに扱う概念。

## 概念

| 概念 | 意味 |
|---|---|
| 利用者 | Share Together にログインした人。初めて使うときに登録される ([サインインと利用者の登録](functional/sign-in.md)) |
| 個人リスト | 利用者本人だけが見られる ToDo のリスト。利用者ごとにデフォルトのリストが 1 つある ([個人リスト](../specs/term/personal-list.md)) |
| グループ | 利用者が共有リストを分け合うための集まり。作った利用者がオーナーになる |
| メンバーシップ | 利用者とグループの結び付き。グループでの立場 (オーナーかメンバーか) と、招待の状態 (招待中・承認済み・拒否済み) を持つ ([グループの立場](../specs/term/group-role.md)) |
| 招待 | オーナーが利用者をグループへ誘う記録。招待中のメンバーシップとして持つ ([招待](../specs/term/invitation.md)) |
| 共有リスト | グループに属する ToDo のリスト。承認済みのメンバーなら誰でも使える ([共有リスト](../specs/term/shared-list.md)) |
| ToDo | リストの中の 1 件のやること。個人リストにも共有リストにも属せる |

## 関係

```mermaid
flowchart TD
    user[利用者]
    personal[個人リスト]
    group[グループ]
    membership["メンバーシップ<br/>(立場と招待の状態)"]
    invitation[招待]
    shared[共有リスト]
    todo[ToDo]
    user -- "持つ (1..多)" --> personal
    user -- "結び付く (0..多)" --> membership
    group -- "持つ (0..多)" --> membership
    membership -- "招待中のとき" --> invitation
    group -- "持つ (0..多)" --> shared
    personal -- "持つ (0..多)" --> todo
    shared -- "持つ (0..多)" --> todo
```

- 1 人の利用者は、デフォルトの個人リストを必ず 1 つ持つ ([個人リスト](functional/personal-list.md))
- グループは、作った利用者を、承認済みのオーナーの最初のメンバーシップとして持つ。グループの人数は、オーナーを含めて 5 名までに制限する ([グループ](functional/group.md))。拒否済み・期限切れの招待の記録も、メンバーシップとして残りうる
- 招待は独立したデータを持たず、招待中のメンバーシップが招待の役を務める。応じると承認済み、断ると拒否済みになる ([招待](functional/invitation.md))
- 共有リストを使えるのは、承認済みのメンバーシップを持つ利用者である。操作の権限は[共有リスト](functional/shared-list.md)と[アクセス制御](non-functional/access-control.md)にある
