---
id: niconico-mylist-assistant/screen/import
title: 動画一括インポート画面
kind: screen
service: niconico-mylist-assistant
sources:
  - services/niconico-mylist-assistant/web/src/app/import/page.tsx
  - services/niconico-mylist-assistant/web/src/components/VideoSearchModal.tsx
  - services/niconico-mylist-assistant/web/src/lib/video-id-input.ts
  - services/niconico-mylist-assistant/web/src/lib/constants/errors.ts
sources_hash: 209415edc03a3a92c3d74913de039cbe265f5008c9b9697b415b3ff0c0299542
terms: [niconico-mylist-assistant/term/video-id, niconico-mylist-assistant/term/video-basic-info]
related_cards: [niconico-mylist-assistant/api/video-import, niconico-mylist-assistant/screen/videos, niconico-mylist-assistant/screen/home]
related_adr:
  - services/niconico-mylist-assistant/requirements.md#3.2 動画検索とインポート
  - services/niconico-mylist-assistant/requirements.md#3.3 動画一括インポート
---

# 動画一括インポート画面

[動画 ID](../term/video-id.md) をまとめて入力して取り込む画面。キーワードで動画を検索して 1 件ずつ追加することもできる。取り込んだ動画が、マイリストに登録する候補になる。

## 入口

- パスは `/import`。ヘッダーの「インポート」と、[ホーム画面](./home.md)の「動画インポート」から来る

## 表示するもの

| 部分 | 内容 |
|---|---|
| 説明 | 入力できる形 (ID または動画の URL)、区切り (改行、カンマ、読点、スペース)、上限 (最大 100 件) |
| 入力欄 | 複数行 (10 行)。実行中は入力できない |
| 「動画を検索して追加」 | 検索ダイアログを開く |
| 「インポート実行」 | 入力が空 (空白だけを含む) のあいだは押せない。実行中はスピナーを出す |
| 結果 | 実行が終わると出す (下) |

入力は、整えてから送る。区切りで分け、URL からは ID を取り出し、英字の ID は小文字にする ([動画 ID](../term/video-id.md))。

インポートの結果 (「インポート結果」のカード) は、次を出す。

| 部分 | 内容 |
|---|---|
| 件数 | 合計、成功、スキップ、失敗 (どれも「N 件」) |
| 成功 | 1 件以上あれば「N 件の動画を正常にインポートしました」 |
| スキップ | 1 件以上あれば「N 件の動画は既に登録済みのためスキップされました」 |
| 失敗 | 1 件以上あれば「N 件の動画のインポートに失敗しました」 |
| 失敗の詳細 | 取得に失敗した動画があれば、折りたたみ「失敗した動画の詳細を表示」に、動画 ID とエラーの内容を並べる |
| 「動画一覧を見る」 | [動画管理画面](./videos.md)に移る |

## 状態

| 状態 | 表示 |
|---|---|
| 区切りしかない入力 (`,` だけなど) | 「動画 ID を入力してください」。送らない |
| 入力が 100 件を超える | 「一度に登録できる動画は最大 100 件です」。送らない。件数は重複を数えたまま |
| サーバーが形式不正を返した | 「不正な動画 ID 形式が含まれています」と、「形式が正しくない動画 ID: ...」。10 件まで並べ、残りは「ほか N 件」 |
| その他の失敗 | サーバーが返した文。なければ「インポートに失敗しました」 |

- 失敗の表示は、次の実行を始めると消える

## 操作

| 操作 | 結果 |
|---|---|
| インポート実行 | [動画取り込み API](../api/video-import.md) (`POST /api/videos/bulk-import`) に整えた ID を送り、結果を出す |
| 動画を検索して追加 | 検索ダイアログを開く |

検索ダイアログ (「動画検索」)。

| 部分 | 内容 |
|---|---|
| 検索 | キーワード (100 文字まで) を入力し、「検索」かエンターキーで [動画取り込み API](../api/video-import.md) (`GET /api/videos/search`) を呼ぶ。入力が空のあいだは検索できない |
| 結果 | 動画ごとにサムネイル、タイトル、動画 ID、ボタンを出す。ボタンは下の表 |
| 未検索 | 「キーワードを入力して検索してください」 |
| 0 件 | 「該当する動画が見つかりませんでした」 |
| 失敗 | サーバーが返した文。なければ「動画検索に失敗しました」 |

| ボタン | 意味 |
|---|---|
| 「追加」 | 取り込める。押すと 1 件だけ `bulk-import` へ送る |
| 「追加済み (登録済)」 | 検索した時点で、サービスの動画データに登録済み。押せない |
| 「追加済み」 | このダイアログで追加できた |

- 追加の応答で、成功も、登録済みによるスキップも 0 件のときは、「動画の追加に失敗しました」を出し、ボタンは「追加」のまま残る (再試行できる)
- 「登録済み」の判定は、動画データ全体への登録の有無で決める。ほかの利用者が取り込んだ動画も登録済みと出る。自分の一覧に入っているかではない ([動画基本情報](../term/video-basic-info.md))
- ダイアログは開くたびに、入力と結果を空にする。追加しても、この画面の結果の表示には反映しない

## 画面の見た目

### 通常表示

入力が空で、「インポート実行」は押せない。

| スマホ | PC |
|---|---|
| ![動画一括インポート画面 通常表示 (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/import-default-mobile.png) | ![動画一括インポート画面 通常表示 (PC)](../../../images/specs/niconico-mylist-assistant/screen/import-default-desktop.png) |

### 100 件を超えたとき

| スマホ | PC |
|---|---|
| ![動画一括インポート画面 100 件を超えたとき (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/import-too-many-mobile.png) | ![動画一括インポート画面 100 件を超えたとき (PC)](../../../images/specs/niconico-mylist-assistant/screen/import-too-many-desktop.png) |

### 形式が正しくない動画 ID

サーバーが弾いた ID を、入力のまま並べる。

| スマホ | PC |
|---|---|
| ![動画一括インポート画面 形式が正しくない動画 ID (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/import-invalid-ids-mobile.png) | ![動画一括インポート画面 形式が正しくない動画 ID (PC)](../../../images/specs/niconico-mylist-assistant/screen/import-invalid-ids-desktop.png) |

### インポート中

応答を待っているあいだ。

| スマホ | PC |
|---|---|
| ![動画一括インポート画面 インポート中 (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/import-importing-mobile.png) | ![動画一括インポート画面 インポート中 (PC)](../../../images/specs/niconico-mylist-assistant/screen/import-importing-desktop.png) |

### インポート結果

成功、スキップ、失敗が混ざった例。失敗の詳細を開いている。

| スマホ | PC |
|---|---|
| ![動画一括インポート画面 インポート結果 (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/import-result-mobile.png) | ![動画一括インポート画面 インポート結果 (PC)](../../../images/specs/niconico-mylist-assistant/screen/import-result-desktop.png) |

### インポートに失敗したとき

サーバーのエラー。

| スマホ | PC |
|---|---|
| ![動画一括インポート画面 インポートに失敗したとき (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/import-import-error-mobile.png) | ![動画一括インポート画面 インポートに失敗したとき (PC)](../../../images/specs/niconico-mylist-assistant/screen/import-import-error-desktop.png) |

### 検索ダイアログ

検索前。

| スマホ | PC |
|---|---|
| ![動画一括インポート画面 検索ダイアログ (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/import-search-dialog-mobile.png) | ![動画一括インポート画面 検索ダイアログ (PC)](../../../images/specs/niconico-mylist-assistant/screen/import-search-dialog-desktop.png) |

### 検索結果

追加できるものと、登録済みのもの。

| スマホ | PC |
|---|---|
| ![動画一括インポート画面 検索結果 (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/import-search-results-mobile.png) | ![動画一括インポート画面 検索結果 (PC)](../../../images/specs/niconico-mylist-assistant/screen/import-search-results-desktop.png) |

### 検索結果が 0 件のとき

| スマホ | PC |
|---|---|
| ![動画一括インポート画面 検索結果が 0 件のとき (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/import-search-empty-mobile.png) | ![動画一括インポート画面 検索結果が 0 件のとき (PC)](../../../images/specs/niconico-mylist-assistant/screen/import-search-empty-desktop.png) |

### 検索に失敗したとき

| スマホ | PC |
|---|---|
| ![動画一括インポート画面 検索に失敗したとき (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/import-search-error-mobile.png) | ![動画一括インポート画面 検索に失敗したとき (PC)](../../../images/specs/niconico-mylist-assistant/screen/import-search-error-desktop.png) |

## つながり

```mermaid
flowchart TD
    H[ホーム画面<br/>ヘッダーのメニュー] --> S[動画一括インポート画面]
    S -->|インポート実行| A[動画取り込み API<br/>bulk-import]
    S -->|検索| B[動画取り込み API<br/>search]
    S -->|1 件ずつ追加| A
    S -->|動画一覧を見る| V[動画管理画面]
    A --> D[(動画基本情報<br/>ユーザー設定)]
```
