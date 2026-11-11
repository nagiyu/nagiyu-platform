---
id: livetalk/screen/note-detail
title: ノート詳細画面
kind: screen
service: livetalk
sources:
  - services/livetalk/web/src/app/notes/[id]/page.tsx
  - services/livetalk/web/src/components/NoteMarkdown.tsx
  - services/livetalk/web/src/lib/notes/messages.ts
  - services/livetalk/web/src/lib/notes/api-client.ts
sources_hash: 5afa2d8811bf561ecd98cc49c45cbc2be0b99c0eb22785424a026dc5573699fd
terms: [livetalk/term/note, livetalk/term/topic, livetalk/term/web-fact, livetalk/term/permission]
related_cards: [livetalk/screen/notes, livetalk/api/notes]
related_adr:
  - services/livetalk/external-design.md#SCR-005 / SCR-006: ノート一覧・詳細
---

# ノート詳細画面

1 件の[ノート](../term/note.md)の、手紙の文面と、調べた内容、出典を見せる画面。

## 入口

- パスは `/notes/{ID}`。ノート一覧画面のカードから来る

## 表示の条件

- `livetalk:chat` を持つ利用者だけ ([権限とロール](../term/permission.md))

## 表示するもの

| 部分 | 内容 |
|---|---|
| 戻るリンク | 「← ノート一覧へ」 |
| 見出し | 主題 (贈った時点のもの) と、贈った日 |
| 手紙 | 贈った時点の文面。Markdown として描く (太字、リスト、リンクなど)。リンクは別のタブで開く |
| 調べた内容 (最新) | 参照先の[話題](../term/topic.md)の、今の [WEB fact](../term/web-fact.md)。箇条書き |
| 出典 | 上の調べた内容の出典の URL。リンク |

- 手紙は変わらないが、調べた内容と出典は、開くたびに参照先の話題の最新を読む
- 調べた内容と出典は、あるときだけ出す。参照先の話題を読めなかったときは、手紙だけになる

## 状態

- 読み込み中は、読み込みの表示を出す
- 取得に失敗したときは、赤い文字で「ノートの取得に失敗しました」を出す。ノートがない (404) ときも同じ文言になる

## 操作

| 操作 | 結果 |
|---|---|
| ← ノート一覧へ | [ノート一覧画面](./notes.md)を開く |
| 出典のリンク | 出典の URL を別のタブで開く |

- ノートは [ノート API](../api/notes.md) で読む

## 画面の見た目

### 通常表示

手紙、調べた内容、出典。

| スマホ |
|---|
| ![ノート詳細画面 通常表示 (スマホ)](../../../images/specs/livetalk/screen/note-detail-default-mobile.png) |

### 手紙だけのとき

参照先の話題を読めなかったとき。調べた内容と出典は出ない。

| スマホ |
|---|
| ![ノート詳細画面 手紙だけのとき (スマホ)](../../../images/specs/livetalk/screen/note-detail-headline-only-mobile.png) |

### 読み込み中

応答を待っている間。

| スマホ |
|---|
| ![ノート詳細画面 読み込み中 (スマホ)](../../../images/specs/livetalk/screen/note-detail-loading-mobile.png) |

### ノートが見つからないとき

取得の失敗と同じ文言。

| スマホ |
|---|
| ![ノート詳細画面 ノートが見つからないとき (スマホ)](../../../images/specs/livetalk/screen/note-detail-not-found-mobile.png) |

## つながり

```mermaid
flowchart TD
    N[ノート一覧画面] --> S[ノート詳細画面]
    S -->|詳細| A[ノート API]
    S -->|戻る| N
```
