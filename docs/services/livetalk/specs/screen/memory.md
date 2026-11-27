---
sources:
  - services/livetalk/web/src/app/memory/page.tsx
  - services/livetalk/web/src/components/MemoryList.tsx
  - services/livetalk/web/src/components/MemoryItem.tsx
  - services/livetalk/web/src/components/MemoryDeleteDialog.tsx
  - services/livetalk/web/src/lib/memory/messages.ts
  - services/livetalk/web/src/lib/memory/api-client.ts
sources_hash: a7a521b37f5c91503708f92688794c42d3e6ae4e81f41be27a006cc5b216f98c
---

# 記憶画面

キャラクターが利用者について覚えていること ([SELF fact](../term/self-fact.md)) を、話題ごとにまとめて並べ、1 件ずつ削除できる画面。

## 入口

- パスは `/memory`。ヘッダーのメニューの「私が覚えていること」から来る

## 表示の条件

- ログインしている利用者なら誰でも ([権限とロール](../term/permission.md))
- 選んでいる[キャラクター](../term/character.md)の記憶だけを出す。キャラクターを切り替えると読み直す

## 表示するもの

| 部分 | 内容 |
|---|---|
| 見出し | 「私が覚えていること」 |
| 案内 | 「ここは{名前}ちゃんがあなたについて覚えていることだよ。消したい項目は削除してね。内容を変えたいときは話しかけて訂正してね。」 |
| 一覧 | 話題の主題 ([Topic](../term/topic.md)) の見出しごとに、その SELF fact の文を並べる。作成日時の新しい順で、最初に出る項目の話題が先頭。各項目に削除のボタン |

- 編集の機能はない
- 調べた内容 (WEB fact) は出さない

## 状態

- 読み込み中は、読み込みの表示を出す
- 0 件のときは「まだここに覚えていることはないみたい。」
- 取得に失敗したときは、赤い文字で「覚えていることの取得に失敗しました」を出し、空の文言は出さない

## 操作

| 操作 | 結果 |
|---|---|
| 削除のボタン | 確認のダイアログを開く。「この記憶を削除しますか？」「「{文}」を忘れます。元には戻せません。」と、削除すると以降の会話に出てこなくなり、元に戻せない旨の注意を出す |
| 確認の「削除」 | [記憶 API](../api/memory.md) で削除し、一覧を読み直してダイアログを閉じる。削除に失敗したときは、ダイアログの中に「覚えていることの削除に失敗しました」を出し、閉じない |
| 「キャンセル」 | 閉じる |

## 画面の見た目

### 通常表示

話題ごとにまとまる。

| スマホ |
|---|
| ![記憶画面 通常表示 (スマホ)](../../../../images/specs/livetalk/screen/memory-default-mobile.png) |

### 削除の確認

削除の影響を注意として添える。

| スマホ |
|---|
| ![記憶画面 削除の確認 (スマホ)](../../../../images/specs/livetalk/screen/memory-delete-dialog-mobile.png) |

### 削除に失敗したとき

ダイアログの中にエラーを出す。

| スマホ |
|---|
| ![記憶画面 削除に失敗したとき (スマホ)](../../../../images/specs/livetalk/screen/memory-delete-error-mobile.png) |

### 覚えていることがないとき

空の文言を出す。

| スマホ |
|---|
| ![記憶画面 覚えていることがないとき (スマホ)](../../../../images/specs/livetalk/screen/memory-empty-mobile.png) |

### 読み込み中

応答を待っている間。

| スマホ |
|---|
| ![記憶画面 読み込み中 (スマホ)](../../../../images/specs/livetalk/screen/memory-loading-mobile.png) |

### 取得に失敗したとき

エラーだけを出す。

| スマホ |
|---|
| ![記憶画面 取得に失敗したとき (スマホ)](../../../../images/specs/livetalk/screen/memory-fetch-error-mobile.png) |

### 別のキャラクターを選んでいるとき

案内の名前がキャラクターに合わせて変わる。

| スマホ |
|---|
| ![記憶画面 別のキャラクターを選んでいるとき (スマホ)](../../../../images/specs/livetalk/screen/memory-character-ageha-mobile.png) |

## つながり

```mermaid
flowchart TD
    H[ヘッダーのメニュー] --> S[記憶画面]
    S -->|一覧・削除| A[記憶 API]
    S -.キャラクターの切り替え.-> S
```

## 理由

- **見せるのは「私について覚えていること」(SELF fact) だけ**。キャラクターが調べた内容 (WEB fact) は、ここに出さず、削除の対象にもしない。利用者の記憶と調べた知識が混ざらないようにするため
- **Tier 別のタブやピン留めを持たない**。会話では、発言との関連度で話題を想起するので、利用者に記憶の階層や常に想起させる指定を見せる必要がない
- **話題ごとにまとめて並べる**。裏では複数の話題の SELF fact を横断して集め、話題の主題の見出しで束ねる
- **削除の確認に、元に戻せないことを注意として添える**。削除は物理削除で、話題の要約も即時に作り直すので、消した内容は以降の応答にも残らない。詳しい理由は[記憶 API](../api/memory.md)にある
- 誤った情報が残り続けることへの配慮として、削除の手段を提供する
