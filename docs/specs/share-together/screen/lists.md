---
id: share-together/screen/lists
title: リスト画面
kind: screen
service: share-together
sources:
  - services/share-together/web/src/app/lists/page.tsx
  - services/share-together/web/src/components/ListWorkspace.tsx
  - services/share-together/web/src/components/ListSidebar.tsx
  - services/share-together/web/src/components/TodoList.tsx
  - services/share-together/web/src/components/TodoItem.tsx
  - services/share-together/web/src/components/TodoForm.tsx
  - services/share-together/web/src/components/CreateItemDialog.tsx
  - services/share-together/web/src/lib/listsQuery.ts
  - services/share-together/web/src/lib/constants/errors.ts
sources_hash: 373ad0ab5cd63d010de92eef6c4de9664d0c791fc327cfd082e5d2221b76eff8
terms: [share-together/term/personal-list, share-together/term/shared-list, share-together/term/group-role]
related_cards: [share-together/api/personal-lists, share-together/api/personal-todos, share-together/api/group-lists, share-together/api/group-todos, share-together/api/groups, share-together/screen/groups, share-together/screen/home, share-together/flow/session-start]
related_adr:
  - services/share-together/architecture.md#2.8 スコープ切り替え時のリスト選択
  - services/share-together/architecture.md#2.9 リスト作成における個人スコープと共有スコープの責務分離
  - services/share-together/architecture.md#2.12 共有リスト編集の権限を全承認済みメンバーに付与する
---

# リスト画面

リストを選び、その ToDo を追加・編集・完了・削除する画面。[個人リスト](../term/personal-list.md)と[共有リスト](../term/shared-list.md)を、「表示範囲」で切り替えて扱う。

## 入口

- パスは `/lists`。ヘッダーの「リスト」、[トップ画面](./home.md)の「リストを開く」、[グループ画面](./groups.md)の共有リストのリンクから来る。前回の訪問先の復元でも開く ([起動時の流れ](../flow/session-start.md))
- 開くリストはクエリで指定できる

| クエリ | 意味 |
|---|---|
| `scope` | `shared` なら共有リスト。それ以外 (未指定を含む) は個人リスト |
| `groupId` | 共有リストのグループ |
| `listId` | 開くリスト |

- クエリは開いたときの 1 回だけ読む。そのあと利用者が選び直すと、画面は選んだ内容を URL のクエリへ書き戻す (履歴は増やさない)。自動の補正では書き戻さない
- 個人リストは、`listId` が自分の個人リストにあればそれを、なければデフォルトリストを開く。個人リスト一覧の取得に失敗したときは、`listId` があればそのまま開く
- 共有リストで `listId` があれば、それをそのまま初期の選択にする。グループと突き合わせて、選んだグループの先頭のリストへ補正する (そのグループになければ、一致するグループか先頭のグループを選ぶ)

## 表示するもの

左に選択部、右に ToDo の一覧を置く (幅が狭いときは縦に積む)。

| 部分 | 内容 |
|---|---|
| 表示範囲 | 「個人」か「共有」。切り替えると、共有なら選んでいるグループの先頭のリストを、個人なら最後に見ていた個人リストを開く |
| グループ (共有のみ) | 参加しているグループの選択。変えると、そのグループの先頭のリストを開く |
| サイドバー | 見出し (個人リスト / 共有リスト)、作成ボタン、リストの名前。選んでいるものが強調され、各リストに名前の変更 (鉛筆) と削除 (ごみ箱) のボタンが付く |
| ToDo | 見出し「ToDo」、「タイトル」欄と「追加」ボタン、ToDo の一覧 |

- ToDo の一覧は、チェックボックス、タイトル、「編集」、「削除」の行を並べる。完了したものはタイトルに取り消し線を付け、薄い色にする。個人リストの ToDo は作成の古い順に並ぶ (共有リストの並びは[共有 ToDo API](../api/group-todos.md))
- 「タイトル」欄は 200 文字まで入力できる。空白だけだと「追加」は押せない
- 名前の変更と削除のボタンは、スクリーンリーダー向けの名前 (`aria-label`) を「{リスト名}を編集」「{リスト名}を削除」にする
- デフォルトの個人リストは、削除ボタンが押せない
- 個人リストが 100 件に達すると、個人リストの作成ボタンが押せなくなり、「個人リストは100件まで作成できます」を出す

## 表示の条件

- どの[グループの立場](../term/group-role.md)でも、共有リストの作成・名前の変更・削除・ToDo の操作は同じに使える
- 共有リストは、自分が承認済みのメンバーであるグループのものだけが出る

## 状態

| 状況 | 表示 |
|---|---|
| 個人リストを決めるまで | 「リストを読み込み中です...」 |
| 個人リスト一覧を取れず、開くリストも決まらない | 赤字で「デフォルト個人リストの取得に失敗しました。」 |
| ToDo が 0 件 (取得に成功したとき) | 「ToDoはまだありません。」 |
| ToDo の取得に失敗 | 「ToDo一覧の取得に失敗しました。」の通知。0 件の案内は出さない |
| 共有: グループがない | 「参加しているグループがありません。グループ画面でグループを作成するか、招待を承認してください。」 |
| 共有: 選んだグループに共有リストがない | 「共有リストはまだありません。「共有リストを作成」から追加できます。」 |
| 共有: グループ一覧の取得に失敗 | エラーの帯で「共有グループ一覧を取得できませんでした。時間をおいて再読み込みしてください。」 |
| 共有: 選んだグループの共有リストの取得に失敗 | エラーの帯で「このグループの共有リストを取得できませんでした。時間をおいて再読み込みしてください。」 (リストが 0 件の案内とは区別する) |

通知は 3 秒で消える。

## 操作

ToDo の操作 (個人も共有も同じ)。

| 操作 | 結果 |
|---|---|
| 「追加」 (または Enter) | 前後の空白を除いたタイトルで ToDo を作る。成功すると末尾に足し、入力を空にして「ToDoを追加しました。」。失敗すると入力を残し、「ToDoの追加に失敗しました。」 |
| チェックボックス | 完了と未完了を切り替える。成功しても通知は出ない。失敗すると「ToDoの更新に失敗しました。」 |
| 「編集」 | タイトルを編集欄にし、「キャンセル」と「保存」を出す。Enter で保存、Escape (変換中を除く) でキャンセル。空だと保存できない。変更がなければ API を呼ばず閉じる。成功すると「ToDoを更新しました。」。失敗すると編集欄を開いたままにして「ToDoの更新に失敗しました。」 |
| 「削除」 | 「ToDoを削除」の確認 (「このToDoを削除しますか？」) を出す。確定すると削除し、一覧を読み直して「ToDoを削除しました。」。失敗すると「ToDoの削除に失敗しました。」 |

呼ぶ API は、個人リストなら[個人 ToDo API](../api/personal-todos.md)、共有リストなら[共有 ToDo API](../api/group-todos.md)。

リストの操作。

| 操作 | 個人リスト | 共有リスト |
|---|---|---|
| 作成 | サイドバーの「個人リストを作成」。名前を入れて [個人リスト API](../api/personal-lists.md) へ送る。成功すると末尾に足してそのリストを開き、「個人リストを作成しました。」 | 「共有リストを作成」。[共有リスト API](../api/group-lists.md) へ送る。成功すると末尾に足してそのリストを開き、「共有リスト「{名前}」を作成しました。」 |
| 名前の変更 | 鉛筆ボタン。「個人リスト名を変更」のダイアログに現在の名前が入る。「保存」で送る。同じ名前なら何もしない。成功すると「個人リスト名を更新しました。」 | 同じ。ダイアログは「共有リスト名を変更」。成功すると「共有リスト名を更新しました。」 |
| 削除 | ごみ箱ボタン。「個人リストを削除」の確認を出し、確定すると削除する。開いていたリストなら、残った先頭のリストを開く。「個人リストを削除しました。」 | 同じ。確認は「共有リストを削除」。開いていたリストなら、先頭のリストを開く。0 件になると、リストを選んでいない状態 (案内を出す) になる。「共有リストを削除しました。」 |

- リストの操作に失敗すると、API が返した文言を通知する。読めなければ、個人は「個人リストの作成に失敗しました」など、共有は「共有リストの作成に失敗しました。」などの固定の文言を使う (共有の名前の変更・削除の失敗も同様)
- 作成のダイアログは、空白だけの名前だと「作成」が押せない。Enter でも確定できる

## 画面の見た目

### 個人リスト

リストを指定せずに開いた状態。デフォルトリストが開く。完了した ToDo には取り消し線が付く。

| スマホ | PC |
|---|---|
| ![個人リスト (スマホ)](../../../images/specs/share-together/screen/lists-personal-default-mobile.png) | ![個人リスト (PC)](../../../images/specs/share-together/screen/lists-personal-default-desktop.png) |

### ToDo がないとき

「ToDoはまだありません。」を出す。

| スマホ | PC |
|---|---|
| ![ToDo がないとき (スマホ)](../../../images/specs/share-together/screen/lists-personal-empty-mobile.png) | ![ToDo がないとき (PC)](../../../images/specs/share-together/screen/lists-personal-empty-desktop.png) |

### ToDo を編集しているとき

タイトルが編集欄になり、「キャンセル」と「保存」が出る。

| スマホ | PC |
|---|---|
| ![ToDo を編集しているとき (スマホ)](../../../images/specs/share-together/screen/lists-todo-editing-mobile.png) | ![ToDo を編集しているとき (PC)](../../../images/specs/share-together/screen/lists-todo-editing-desktop.png) |

### ToDo の削除の確認

削除の確認を出す。

| スマホ | PC |
|---|---|
| ![ToDo の削除の確認 (スマホ)](../../../images/specs/share-together/screen/lists-todo-delete-dialog-mobile.png) | ![ToDo の削除の確認 (PC)](../../../images/specs/share-together/screen/lists-todo-delete-dialog-desktop.png) |

### 個人リストの作成

名前を入れる。

| スマホ | PC |
|---|---|
| ![個人リストの作成 (スマホ)](../../../images/specs/share-together/screen/lists-list-create-dialog-mobile.png) | ![個人リストの作成 (PC)](../../../images/specs/share-together/screen/lists-list-create-dialog-desktop.png) |

### 個人リストの名前の変更

現在の名前が入っている。

| スマホ | PC |
|---|---|
| ![個人リストの名前の変更 (スマホ)](../../../images/specs/share-together/screen/lists-list-rename-dialog-mobile.png) | ![個人リストの名前の変更 (PC)](../../../images/specs/share-together/screen/lists-list-rename-dialog-desktop.png) |

### 個人リストの削除の確認

リストの名前を入れた確認を出す。

| スマホ | PC |
|---|---|
| ![個人リストの削除の確認 (スマホ)](../../../images/specs/share-together/screen/lists-list-delete-dialog-mobile.png) | ![個人リストの削除の確認 (PC)](../../../images/specs/share-together/screen/lists-list-delete-dialog-desktop.png) |

### 個人リストが 100 件に達したとき

作成ボタンが押せなくなり、上限の文言を出す。

| スマホ | PC |
|---|---|
| ![個人リストが 100 件に達したとき (スマホ)](../../../images/specs/share-together/screen/lists-list-limit-mobile.png) | ![個人リストが 100 件に達したとき (PC)](../../../images/specs/share-together/screen/lists-list-limit-desktop.png) |

### ToDo の取得に失敗したとき

通知を出す。ToDo の一覧は空のまま、0 件の案内は出ない。

| スマホ | PC |
|---|---|
| ![ToDo の取得に失敗したとき (スマホ)](../../../images/specs/share-together/screen/lists-todo-fetch-error-mobile.png) | ![ToDo の取得に失敗したとき (PC)](../../../images/specs/share-together/screen/lists-todo-fetch-error-desktop.png) |

### 個人リスト一覧の取得に失敗したとき

開くリストが決まらず、エラーだけを出す。

| スマホ | PC |
|---|---|
| ![個人リスト一覧の取得に失敗したとき (スマホ)](../../../images/specs/share-together/screen/lists-default-list-error-mobile.png) | ![個人リスト一覧の取得に失敗したとき (PC)](../../../images/specs/share-together/screen/lists-default-list-error-desktop.png) |

### 共有リスト (オーナー)

グループの選択、共有リスト、ToDo を出す。

| スマホ | PC |
|---|---|
| ![共有リスト (オーナー) (スマホ)](../../../images/specs/share-together/screen/lists-shared-default-mobile.png) | ![共有リスト (オーナー) (PC)](../../../images/specs/share-together/screen/lists-shared-default-desktop.png) |

### 共有リスト (メンバー)

オーナーでなくても、リストの名前の変更・削除ボタンが同じに出る。

| スマホ | PC |
|---|---|
| ![共有リスト (メンバー) (スマホ)](../../../images/specs/share-together/screen/lists-shared-member-mobile.png) | ![共有リスト (メンバー) (PC)](../../../images/specs/share-together/screen/lists-shared-member-desktop.png) |

### 共有リストの作成

名前を入れる。

| スマホ | PC |
|---|---|
| ![共有リストの作成 (スマホ)](../../../images/specs/share-together/screen/lists-shared-create-dialog-mobile.png) | ![共有リストの作成 (PC)](../../../images/specs/share-together/screen/lists-shared-create-dialog-desktop.png) |

### 共有リストの名前の変更

現在の名前が入っている。

| スマホ | PC |
|---|---|
| ![共有リストの名前の変更 (スマホ)](../../../images/specs/share-together/screen/lists-shared-rename-dialog-mobile.png) | ![共有リストの名前の変更 (PC)](../../../images/specs/share-together/screen/lists-shared-rename-dialog-desktop.png) |

### 共有リストの削除の確認

リストの名前を入れた確認を出す。

| スマホ | PC |
|---|---|
| ![共有リストの削除の確認 (スマホ)](../../../images/specs/share-together/screen/lists-shared-delete-dialog-mobile.png) | ![共有リストの削除の確認 (PC)](../../../images/specs/share-together/screen/lists-shared-delete-dialog-desktop.png) |

### グループに入っていないとき

グループ画面へ案内する文言を出す。

| スマホ | PC |
|---|---|
| ![グループに入っていないとき (スマホ)](../../../images/specs/share-together/screen/lists-shared-no-groups-mobile.png) | ![グループに入っていないとき (PC)](../../../images/specs/share-together/screen/lists-shared-no-groups-desktop.png) |

### 共有リストがないとき

作成を促す文言を出す。

| スマホ | PC |
|---|---|
| ![共有リストがないとき (スマホ)](../../../images/specs/share-together/screen/lists-shared-no-lists-mobile.png) | ![共有リストがないとき (PC)](../../../images/specs/share-together/screen/lists-shared-no-lists-desktop.png) |

### グループ一覧の取得に失敗したとき

エラーの帯を出す。

| スマホ | PC |
|---|---|
| ![グループ一覧の取得に失敗したとき (スマホ)](../../../images/specs/share-together/screen/lists-shared-groups-fetch-error-mobile.png) | ![グループ一覧の取得に失敗したとき (PC)](../../../images/specs/share-together/screen/lists-shared-groups-fetch-error-desktop.png) |

### 共有リストの取得に失敗したとき

エラーの帯を出す。0 件の案内とは別の文言。

| スマホ | PC |
|---|---|
| ![共有リストの取得に失敗したとき (スマホ)](../../../images/specs/share-together/screen/lists-shared-lists-fetch-error-mobile.png) | ![共有リストの取得に失敗したとき (PC)](../../../images/specs/share-together/screen/lists-shared-lists-fetch-error-desktop.png) |

## つながり

```mermaid
flowchart TD
    N[ヘッダー リスト<br/>トップ画面<br/>グループ画面] --> S[リスト画面]
    S -->|個人リストの一覧・作成・変更・削除| A1[個人リスト API]
    S -->|個人リストの ToDo| A2[個人 ToDo API]
    S -->|参加しているグループ| A3[グループ API]
    S -->|共有リストの一覧・作成・変更・削除| A4[共有リスト API]
    S -->|共有リストの ToDo| A5[共有 ToDo API]
```
