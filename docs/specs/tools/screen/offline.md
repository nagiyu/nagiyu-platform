---
id: tools/screen/offline
title: オフライン画面
kind: screen
service: tools
sources:
  - services/tools/src/app/offline/page.tsx
sources_hash: 8193952d1dab6fcd1e314b594854d9d4dc0f06502c3e359f221922aa3b441d76
terms: [tools/term/migration-dialog]
related_cards: [tools/screen/home, tools/flow/share-target]
related_adr:
  - services/tools/architecture.md#PWA 構成
  - services/tools/requirements.md#F-005: PWA対応
---

# オフライン画面

接続が使えないことを知らせ、再読み込みを促す画面。ログインは要らない。

## 入口

- パスは `/offline`
- この画面へ自動で切り替える処理はない。Service Worker を登録するコードがなく、ほかの画面からのリンクもない。URL を直接開いたときだけ見える

## 表示の条件

- 初回の訪問では、[初回訪問ダイアログ](../term/migration-dialog.md)が前面に出て、閉じるまでこの画面は操作できない

## 表示するもの

| 部分 | 内容 |
|---|---|
| アイコン | 電波が切れたことを示すアイコン |
| 見出し | 「オフラインです」 |
| 説明 | 「インターネット接続が利用できません。」「接続を確認してから、もう一度お試しください。」 |
| 再読み込み | ボタン |

ヘッダーとフッターは、ほかの画面と同じものが付く。

## 操作

| 操作 | 結果 |
|---|---|
| 「再読み込み」 | ブラウザで今のページ (`/offline`) を読み込み直す。直前に使っていたツールの画面へは戻らない |

API は呼ばない。

## 画面の見た目

### 通常表示

見出しと再読み込みのボタンだけが出る。

| スマホ | PC |
|---|---|
| ![オフライン画面 通常表示 (スマホ)](../../../images/specs/tools/screen/offline-default-mobile.png) | ![オフライン画面 通常表示 (PC)](../../../images/specs/tools/screen/offline-default-desktop.png) |

## つながり

```mermaid
flowchart TD
    U[URL を直接開く] --> O[オフライン画面]
    O -->|再読み込み| O
```
