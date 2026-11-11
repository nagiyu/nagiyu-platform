---
id: share-together/screen/groups
title: グループ画面
kind: screen
service: share-together
sources:
  - services/share-together/web/src/app/groups/page.tsx
  - services/share-together/web/src/components/GroupCard.tsx
  - services/share-together/web/src/components/GroupDetailClient.tsx
  - services/share-together/web/src/components/InviteForm.tsx
  - services/share-together/web/src/components/CreateItemDialog.tsx
  - services/share-together/web/src/lib/listsQuery.ts
  - services/share-together/web/src/lib/constants/errors.ts
sources_hash: 64c9844577ee4c2507e1bfcef6f9f26cb75eaba9bc977725dcdc10dc9bbfcaa9
terms: [share-together/term/group-role, share-together/term/invitation, share-together/term/shared-list]
related_cards: [share-together/api/groups, share-together/api/group-members, share-together/api/group-lists, share-together/screen/lists, share-together/flow/group-invitation, share-together/screen/home]
related_adr:
  - services/share-together/architecture.md#2.5 グループ削除時のアプリケーション層カスケード削除
  - services/share-together/architecture.md#2.6 ユーザー検索をメールアドレス完全一致とした理由
  - services/share-together/architecture.md#2.12 共有リスト編集の権限を全承認済みメンバーに付与する
---

# グループ画面

参加しているグループの一覧と、選んだグループのメンバー・共有リスト・招待を扱う画面。[オーナーとメンバー](../term/group-role.md)で、できる操作が違う。

## 入口

- パスは `/groups`。ヘッダーの「グループ」と、[トップ画面](./home.md)の「グループを管理」から来る

## 表示の条件

見え方は、選んだグループでの自分の[立場](../term/group-role.md)で変わる。

| 部分 | オーナー | メンバー |
|---|---|---|
| メンバーの削除ボタン | 自分以外の各メンバーに出る | 出ない |
| グループの操作ボタン | 「グループを削除」 | 「グループを脱退」 |
| 招待フォーム | 使える | 入力と送信が押せず、「このグループではメンバー追加はできません（オーナーのみ）。」と出る |

- 立場は、グループ一覧 API が返すオーナーかどうかの値で決める。作ったばかりのグループは、返ってきたオーナーの ID と自分の ID を比べて決める

## 表示するもの

| 部分 | 内容 |
|---|---|
| 「グループを作成」 | 画面の上部のボタン |
| グループの一覧 | カードごとにグループ名と「メンバー数: n」。選んでいるカードは枠が強調される。最初は先頭のグループを選ぶ |
| 選んだグループの詳細 | グループ名の見出しと、下の 3 つのカード |

メンバー数は、一覧を開いたときに各グループのメンバーを読んで数える。読めなかったグループは 0 とする。

| カード | 内容 |
|---|---|
| メンバー一覧 | 承認済みのメンバーの名前。立場に応じた削除ボタンと、グループを削除・脱退するボタン |
| 共有リスト | グループの[共有リスト](../term/shared-list.md)の名前。押すと、そのリストを開いた[リスト画面](./lists.md)へ移る。0 件なら「共有リストはまだありません。」。「新しい共有リスト名」の欄と「共有リストを作成」ボタンがある |
| メンバー招待フォーム | メールアドレスの欄と「招待を送信」ボタン |

## 状態

- 一覧の読み込み中は「読み込み中...」を出す
- 0 件のときは「グループはまだありません。「グループを作成」から追加できます。」
- 一覧の取得に失敗すると、「グループ一覧の取得に失敗しました。」を通知する。このとき 0 件の案内は出さず、一覧は空のままになる
- 選んだグループの詳細の読み込み中は「グループ詳細を読み込み中...」、取得に失敗すると赤字で「グループ詳細の取得に失敗しました。」を出す
- 招待フォームの状態

| 状態 | 表示 |
|---|---|
| 送信に成功 | 「招待を送信しました。」を出し、入力欄を空にする。入力を変えると消える |
| メールアドレスの形式が不正 | 「メールアドレスの形式が正しくありません」。API は呼ばない |
| API が失敗 | API が返した文言。読めなければ「招待の送信に失敗しました。」 |
| メンバーが 5 名に達している (オーナーのみ) | 「グループメンバーは最大5名です」を出し、入力と送信が押せなくなる |

メンバーの人数は、詳細に出ている承認済みのメンバーの数である。招待中の人は数えない (API は招待中の人も数える。[メンバー API](../api/group-members.md))。

## 操作

| 操作 | 結果 |
|---|---|
| 「グループを作成」 | 名前を入れるダイアログを開く。「作成」で[グループ API](../api/groups.md) へ送る。空白だけの名前は送れない。成功すると一覧の末尾にカード (メンバー数 1) を足し、「グループ「{名前}」を作成しました。」を通知する。すでにグループを選んでいれば選択は変えず、1 つも選んでいなければ作ったグループを選ぶ。失敗すると「グループの作成に失敗しました。」 (理由は区別しない) |
| グループのカードを押す | そのグループを選び、[メンバー API](../api/group-members.md) と[共有リスト API](../api/group-lists.md) から詳細を読む |
| メンバーの削除ボタン (オーナー) | 「メンバーを削除」の確認 (「{名前}さんをグループから削除しますか？」) を出す。確定すると[メンバー API](../api/group-members.md) で削除し、一覧から外して「{名前}さんをグループから削除しました。」を通知する。カードのメンバー数は変わらない |
| 「グループを削除」 (オーナー) | 「グループを削除」の確認 (「このグループを削除しますか？この操作は元に戻せません。」) を出す。確定すると[グループ API](../api/groups.md) で削除し、詳細を「グループを削除しました。」の表示に置き換える |
| 「グループを脱退」 (メンバー) | 「グループを脱退」の確認を出す。確定すると自分をメンバー API で外し、詳細を「グループから脱退しました。」の表示に置き換える |
| 共有リストを作る | 名前を入れて「共有リストを作成」。空白だけなら何もしない。成功すると一覧の末尾に足し、「共有リストを作成しました。」を通知する。失敗すると API の文言か「共有リストの作成に失敗しました。」 |
| 招待を送る | メールアドレスを入れて「招待を送信」か Enter。[メンバー API](../api/group-members.md) へ送る。送信中は二重に送れない |

- グループの削除と脱退のあとも、一覧のカードは再読み込みするまで残る
- 確認ダイアログの操作が失敗すると、API の文言 (読めなければ「操作に失敗しました。」) を通知し、ダイアログは開いたままになる
- 脱退の確認は、自分の利用者 ID を取れていないと、「脱退処理を実行できませんでした。ページを再読み込みしてから再度お試しください。」を通知する
- 通知は、一覧側が 3 秒、詳細側が 4 秒で消える

## 画面の見た目

### オーナーとして開いたグループ

メンバーの削除ボタンと「グループを削除」が出る。招待フォームが使える。

| スマホ | PC |
|---|---|
| ![オーナーとして開いたグループ (スマホ)](../../../images/specs/share-together/screen/groups-owner-mobile.png) | ![オーナーとして開いたグループ (PC)](../../../images/specs/share-together/screen/groups-owner-desktop.png) |

### メンバーとして開いたグループ

削除ボタンはなく、「グループを脱退」が出る。招待フォームは押せない。

| スマホ | PC |
|---|---|
| ![メンバーとして開いたグループ (スマホ)](../../../images/specs/share-together/screen/groups-member-mobile.png) | ![メンバーとして開いたグループ (PC)](../../../images/specs/share-together/screen/groups-member-desktop.png) |

### グループがないとき

「グループはまだありません。」の案内を出す。

| スマホ | PC |
|---|---|
| ![グループがないとき (スマホ)](../../../images/specs/share-together/screen/groups-empty-mobile.png) | ![グループがないとき (PC)](../../../images/specs/share-together/screen/groups-empty-desktop.png) |

### グループの作成

名前を入れる。

| スマホ | PC |
|---|---|
| ![グループの作成 (スマホ)](../../../images/specs/share-together/screen/groups-create-dialog-mobile.png) | ![グループの作成 (PC)](../../../images/specs/share-together/screen/groups-create-dialog-desktop.png) |

### 作成に失敗したとき

101 文字の名前を送った例。通知を出し、一覧は変わらない。

| スマホ | PC |
|---|---|
| ![作成に失敗したとき (スマホ)](../../../images/specs/share-together/screen/groups-create-error-mobile.png) | ![作成に失敗したとき (PC)](../../../images/specs/share-together/screen/groups-create-error-desktop.png) |

### メンバーの削除の確認

オーナーが、メンバーの名前を入れた確認を出す。

| スマホ | PC |
|---|---|
| ![メンバーの削除の確認 (スマホ)](../../../images/specs/share-together/screen/groups-remove-member-dialog-mobile.png) | ![メンバーの削除の確認 (PC)](../../../images/specs/share-together/screen/groups-remove-member-dialog-desktop.png) |

### グループの削除の確認

元に戻せない旨を出す。

| スマホ | PC |
|---|---|
| ![グループの削除の確認 (スマホ)](../../../images/specs/share-together/screen/groups-delete-group-dialog-mobile.png) | ![グループの削除の確認 (PC)](../../../images/specs/share-together/screen/groups-delete-group-dialog-desktop.png) |

### 脱退の確認

メンバーが「グループを脱退」を押した。

| スマホ | PC |
|---|---|
| ![脱退の確認 (スマホ)](../../../images/specs/share-together/screen/groups-leave-dialog-mobile.png) | ![脱退の確認 (PC)](../../../images/specs/share-together/screen/groups-leave-dialog-desktop.png) |

### 脱退した直後

詳細が成功の表示に置き換わる。一覧のカードは残る。

| スマホ | PC |
|---|---|
| ![脱退した直後 (スマホ)](../../../images/specs/share-together/screen/groups-left-mobile.png) | ![脱退した直後 (PC)](../../../images/specs/share-together/screen/groups-left-desktop.png) |

### グループを削除した直後

詳細が成功の表示に置き換わる。一覧のカードは残る。

| スマホ | PC |
|---|---|
| ![グループを削除した直後 (スマホ)](../../../images/specs/share-together/screen/groups-deleted-mobile.png) | ![グループを削除した直後 (PC)](../../../images/specs/share-together/screen/groups-deleted-desktop.png) |

### 招待を送ったとき

「招待を送信しました。」を出す。

| スマホ | PC |
|---|---|
| ![招待を送ったとき (スマホ)](../../../images/specs/share-together/screen/groups-invite-sent-mobile.png) | ![招待を送ったとき (PC)](../../../images/specs/share-together/screen/groups-invite-sent-desktop.png) |

### メールアドレスの形式が不正なとき

API を呼ばずにエラーを出す。

| スマホ | PC |
|---|---|
| ![メールアドレスの形式が不正なとき (スマホ)](../../../images/specs/share-together/screen/groups-invite-invalid-email-mobile.png) | ![メールアドレスの形式が不正なとき (PC)](../../../images/specs/share-together/screen/groups-invite-invalid-email-desktop.png) |

### 登録のないメールアドレスを招待したとき

API が返したエラーを出す。

| スマホ | PC |
|---|---|
| ![登録のないメールアドレスを招待したとき (スマホ)](../../../images/specs/share-together/screen/groups-invite-not-registered-mobile.png) | ![登録のないメールアドレスを招待したとき (PC)](../../../images/specs/share-together/screen/groups-invite-not-registered-desktop.png) |

### メンバーが 5 名に達しているとき

エラーを出し、招待フォームが押せなくなる。

| スマホ | PC |
|---|---|
| ![メンバーが 5 名に達しているとき (スマホ)](../../../images/specs/share-together/screen/groups-member-limit-mobile.png) | ![メンバーが 5 名に達しているとき (PC)](../../../images/specs/share-together/screen/groups-member-limit-desktop.png) |

### 一覧の取得に失敗したとき

通知を出す。一覧は空のまま。

| スマホ | PC |
|---|---|
| ![一覧の取得に失敗したとき (スマホ)](../../../images/specs/share-together/screen/groups-fetch-error-mobile.png) | ![一覧の取得に失敗したとき (PC)](../../../images/specs/share-together/screen/groups-fetch-error-desktop.png) |

### 詳細の取得に失敗したとき

メンバー数は 0 になり、詳細の場所にエラーを出す。

| スマホ | PC |
|---|---|
| ![詳細の取得に失敗したとき (スマホ)](../../../images/specs/share-together/screen/groups-detail-fetch-error-mobile.png) | ![詳細の取得に失敗したとき (PC)](../../../images/specs/share-together/screen/groups-detail-fetch-error-desktop.png) |

## つながり

```mermaid
flowchart TD
    N[ヘッダー グループ<br/>トップ画面] --> S[グループ画面]
    S -->|一覧・作成・削除| A1[グループ API]
    S -->|メンバー・招待・脱退| A2[メンバー API]
    S -->|共有リストの一覧・作成| A3[共有リスト API]
    S -->|共有リストを開く| L[リスト画面]
    A2 -.->|招待が届く| I[招待画面]
```
