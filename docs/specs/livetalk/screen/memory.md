---
id: livetalk/screen/memory
title: 記憶画面
kind: screen
service: livetalk
sources:
  - services/livetalk/web/src/app/memory/page.tsx
  - services/livetalk/web/src/components/MemoryList.tsx
  - services/livetalk/web/src/components/MemoryItem.tsx
  - services/livetalk/web/src/components/MemoryDeleteDialog.tsx
  - services/livetalk/web/src/lib/memory/messages.ts
  - services/livetalk/web/src/lib/memory/api-client.ts
sources_hash: b031c3c6d719679c164e82e25c49be14ccc446c06d4dc70c1ca543c7ae24370f
terms: [livetalk/term/self-fact, livetalk/term/topic, livetalk/term/character, livetalk/term/permission]
related_cards: [livetalk/screen/home, livetalk/api/memory]
related_adr:
  - services/livetalk/external-design.md#SCR-004: 記憶閲覧・削除画面
  - services/livetalk/architecture.md#2.24
---

# 記憶画面

キャラクターが利用者について覚えていること ([SELF fact](../term/self-fact.md)) を、話題ごとにまとめて並べ、1 件ずつ削除できる画面。

## 入口

- パスは `/memory`。ヘッダーのメニューの「私が覚えていること」から来る

## 表示の条件

- `livetalk:chat` を持つ利用者だけ ([権限とロール](../term/permission.md))
- 選んでいる[キャラクター](../term/character.md)の記憶だけを出す。キャラクターを切り替えると読み直す

## 表示するもの

| 部分 | 内容 |
|---|---|
| 見出し | 「私が覚えていること」 |
| 案内 | 「ここは{名前}ちゃんがあなたについて覚えていることだよ。消したい項目は削除してね。内容を変えたいときは話しかけて訂正してね。」 |
| 一覧 | 話題の主題 ([Topic](../term/topic.md)) の見出しごとに、その SELF fact の文を並べる。作成日時の新しい順で、最初に出る項目の話題が先頭。各項目に削除のボタン |

- 編集の機能はない。内容を変えるときは、会話で訂正する
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
| ![記憶画面 通常表示 (スマホ)](../../../images/specs/livetalk/screen/memory-default-mobile.png) |

### 削除の確認

削除の影響を注意として添える。

| スマホ |
|---|
| ![記憶画面 削除の確認 (スマホ)](../../../images/specs/livetalk/screen/memory-delete-dialog-mobile.png) |

### 削除に失敗したとき

ダイアログの中にエラーを出す。

| スマホ |
|---|
| ![記憶画面 削除に失敗したとき (スマホ)](../../../images/specs/livetalk/screen/memory-delete-error-mobile.png) |

### 覚えていることがないとき

空の文言を出す。

| スマホ |
|---|
| ![記憶画面 覚えていることがないとき (スマホ)](../../../images/specs/livetalk/screen/memory-empty-mobile.png) |

### 読み込み中

応答を待っている間。

| スマホ |
|---|
| ![記憶画面 読み込み中 (スマホ)](../../../images/specs/livetalk/screen/memory-loading-mobile.png) |

### 取得に失敗したとき

エラーだけを出す。

| スマホ |
|---|
| ![記憶画面 取得に失敗したとき (スマホ)](../../../images/specs/livetalk/screen/memory-fetch-error-mobile.png) |

### 別のキャラクターを選んでいるとき

案内の名前がキャラクターに合わせて変わる。

| スマホ |
|---|
| ![記憶画面 別のキャラクターを選んでいるとき (スマホ)](../../../images/specs/livetalk/screen/memory-character-ageha-mobile.png) |

## つながり

```mermaid
flowchart TD
    H[ヘッダーのメニュー] --> S[記憶画面]
    S -->|一覧・削除| A[記憶 API]
    S -.キャラクターの切り替え.-> S
```
