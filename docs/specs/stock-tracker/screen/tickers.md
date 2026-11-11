---
id: stock-tracker/screen/tickers
title: ティッカー管理画面
kind: screen
service: stock-tracker
sources:
  - services/stock-tracker/web/app/tickers/page.tsx
sources_hash: efd345268ee86407e6cff197ee5980906489d03e7d7a6e4dbe74f8cfab147a2d
terms: [stock-tracker/term/permission, stock-tracker/term/ticker-id]
related_cards: [stock-tracker/screen/exchanges, stock-tracker/api/tickers]
---

# ティッカー管理画面

銘柄マスタ (ティッカー) の一覧と、作成、銘柄名の編集、削除を行う管理画面。

## 入口

- パスは `/tickers`。ヘッダーの「管理」メニューの「ティッカー」から来る

## 表示の条件

- `stocks:manage-data` を持つ利用者だけ。権限がなければ、一覧を読まずに「権限エラー」を出す ([権限とロール](../term/permission.md))
- セッションの確認中は「セッション情報を確認中...」を出す

## 表示するもの

| 部分 | 内容 |
|---|---|
| 取引所での絞り込み | 取引所を選ぶと、その取引所のティッカーだけにする。選ばなければ全件 |
| 一覧 | 列は[ティッカー ID](../term/ticker-id.md)、シンボル、銘柄名、取引所、操作 |

## 状態

- 読み込み中は一覧の中にインラインの表示を出す
- 0 件のときは「ティッカーが登録されていません」
- 401 / 403 のときは、権限がない旨のエラーを出す

## 操作

| 操作 | 結果 |
|---|---|
| 作成する | シンボル、銘柄名、取引所を入力して[ティッカー API](../api/tickers.md) に登録する。ティッカー ID は取引所の `key` とシンボルから決まる。成功すると一覧を読み直す |
| 編集する | 銘柄名だけ変えられる (ティッカー ID、シンボル、取引所は表示のみ)。銘柄名が空のときは更新できない |
| 削除する | 確認のあとに削除する。関連する保有株式やアラートは確認しない |
| 取引所を絞り込む | 絞り込んで読み直す |

取引所の選択肢は[取引所 API](../api/exchanges.md) から読む。

## 画面の見た目

### 通常表示

全取引所のティッカーを一覧にする。

| スマホ | PC |
|---|---|
| ![ティッカー管理画面 通常表示 (スマホ)](../../../images/specs/stock-tracker/screen/tickers-default-mobile.png) | ![ティッカー管理画面 通常表示 (PC)](../../../images/specs/stock-tracker/screen/tickers-default-desktop.png) |

### 取引所で絞り込んだ状態

選んだ取引所のティッカーだけにする。

| スマホ | PC |
|---|---|
| ![ティッカー管理画面 取引所で絞り込んだ状態 (スマホ)](../../../images/specs/stock-tracker/screen/tickers-filtered-mobile.png) | ![ティッカー管理画面 取引所で絞り込んだ状態 (PC)](../../../images/specs/stock-tracker/screen/tickers-filtered-desktop.png) |

### ティッカーがないとき

「ティッカーが登録されていません」を出す。

| スマホ | PC |
|---|---|
| ![ティッカー管理画面 ティッカーがないとき (スマホ)](../../../images/specs/stock-tracker/screen/tickers-empty-mobile.png) | ![ティッカー管理画面 ティッカーがないとき (PC)](../../../images/specs/stock-tracker/screen/tickers-empty-desktop.png) |

### 登録ダイアログ

シンボル、銘柄名、取引所を入力する。

| スマホ | PC |
|---|---|
| ![ティッカー管理画面 登録ダイアログ (スマホ)](../../../images/specs/stock-tracker/screen/tickers-create-dialog-mobile.png) | ![ティッカー管理画面 登録ダイアログ (PC)](../../../images/specs/stock-tracker/screen/tickers-create-dialog-desktop.png) |

### 登録に失敗したとき

登録済みのティッカーを作ろうとした例。API が返したエラーを、ダイアログの裏の画面に出す。

| スマホ | PC |
|---|---|
| ![ティッカー管理画面 登録に失敗したとき (スマホ)](../../../images/specs/stock-tracker/screen/tickers-create-error-mobile.png) | ![ティッカー管理画面 登録に失敗したとき (PC)](../../../images/specs/stock-tracker/screen/tickers-create-error-desktop.png) |

### 編集ダイアログ

銘柄名だけ変えられる。

| スマホ | PC |
|---|---|
| ![ティッカー管理画面 編集ダイアログ (スマホ)](../../../images/specs/stock-tracker/screen/tickers-edit-dialog-mobile.png) | ![ティッカー管理画面 編集ダイアログ (PC)](../../../images/specs/stock-tracker/screen/tickers-edit-dialog-desktop.png) |

### 削除の確認

| スマホ | PC |
|---|---|
| ![ティッカー管理画面 削除の確認 (スマホ)](../../../images/specs/stock-tracker/screen/tickers-delete-dialog-mobile.png) | ![ティッカー管理画面 削除の確認 (PC)](../../../images/specs/stock-tracker/screen/tickers-delete-dialog-desktop.png) |

### 一覧の取得に失敗したとき

エラーを出し、一覧は空になる。

| スマホ | PC |
|---|---|
| ![ティッカー管理画面 一覧の取得に失敗したとき (スマホ)](../../../images/specs/stock-tracker/screen/tickers-fetch-error-mobile.png) | ![ティッカー管理画面 一覧の取得に失敗したとき (PC)](../../../images/specs/stock-tracker/screen/tickers-fetch-error-desktop.png) |

### 権限がないとき (`stock-viewer`)

「権限エラー」だけを出す。

| スマホ | PC |
|---|---|
| ![ティッカー管理画面 権限がないとき (`stock-viewer`) (スマホ)](../../../images/specs/stock-tracker/screen/tickers-no-permission-mobile.png) | ![ティッカー管理画面 権限がないとき (`stock-viewer`) (PC)](../../../images/specs/stock-tracker/screen/tickers-no-permission-desktop.png) |

## つながり

```mermaid
flowchart TD
    N[ヘッダー 管理メニュー] --> S[ティッカー管理画面]
    S -->|一覧・作成・更新・削除| A1[ティッカー API]
    S -->|取引所の選択肢| A2[取引所 API]
```
