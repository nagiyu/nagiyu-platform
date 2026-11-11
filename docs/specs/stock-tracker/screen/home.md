---
id: stock-tracker/screen/home
title: トップ画面 (チャート)
kind: screen
service: stock-tracker
sources:
  - services/stock-tracker/web/app/page.tsx
  - services/stock-tracker/web/components/HomePageClient.tsx
  - services/stock-tracker/web/components/QuickActions.tsx
  - services/stock-tracker/web/components/StockChart.tsx
  - services/stock-tracker/web/components/TickerSummaryCard.tsx
  - services/stock-tracker/web/components/HoldingCard.tsx
  - services/stock-tracker/web/components/TickerAlertListCard.tsx
  - services/stock-tracker/web/lib/home-query.ts
  - services/stock-tracker/web/lib/chart-overlay-lines.ts
  - services/stock-tracker/web/lib/constants.ts
  - services/stock-tracker/web/types/stock.ts
sources_hash: d6d3290796e5468d845460b3a10e890787e400b38c928c42993881f1a82af270
terms: [stock-tracker/term/permission, stock-tracker/term/ticker-id, stock-tracker/term/forecast]
related_cards: [stock-tracker/screen/summaries, stock-tracker/screen/holdings, stock-tracker/screen/alerts]
related_adr:
  - services/stock-tracker/architecture.md#2.9
---

# トップ画面 (チャート)

取引所と銘柄を選び、株価チャートと、その銘柄のサマリー・保有株式・アラートを 1 画面で見る。保有株式とアラートはその場で登録、編集、削除できる。

## 入口

- パスは `/`。ヘッダーの「チャート」から来る
- 問い合わせの `exchangeId`、`tickerId`、`timeframe` で、開いた時点の選択を決められる。存在しない取引所・銘柄は無視する
- 利用者が選択を変えると、選択が問い合わせに反映される。`timeframe` は初期値の 1 時間足のときは付けない

## 表示するもの

| 部分 | 内容 |
|---|---|
| 選択 | 取引所、ティッカー (取引所を選ぶと絞られる)、時間枠 (1 分足・5 分足・1 時間足・日足。初期値は 1 時間足)、表示本数 (10・30・50・100 本。初期値は 100) |
| チャート | 選んだ銘柄の足。保有株式があれば平均取得価格の線、有効なアラートの価格の線 (上限・下限) を重ねる。未選択のときは選択を促す表示 |
| サマリー | 方向と荒れの[確度](../term/forecast.md)と確率、点灯したパターン数、更新日時。「詳細」で確度の内訳・日足チャート・足の値を開く |
| 保有株式 | 数量、平均取得価格、通貨 |
| アラート | その銘柄のアラートの一覧 |
| クイックアクション | 保有株式、アラート、サマリーへのリンク。取引所管理とティッカー管理へのリンクは、`stocks:manage-data` を持つときだけ出る |

## 表示の条件

- 追加・編集・削除のボタンは `stocks:write-own` を持つときだけ出る ([権限とロール](../term/permission.md))

## 状態

- 取引所・ティッカー・サマリー・保有株式・アラートは、それぞれ別に読み込む。1 つ失敗しても、ほかは表示する
- サマリーがまだない銘柄は、API が 404 を返し、取得の失敗と同じく「サマリーの取得に失敗しました」を赤字で出す
- 保有株式がない銘柄だけ「追加」できる (通貨は取引所の市場から初期値が決まる)。アラートの一覧が空のときは、その旨を出す

## 操作

| 操作 | 結果 |
|---|---|
| 取引所を選ぶ | ティッカーを絞って読み直す。ティッカーの選択は外れる |
| ティッカーを選ぶ | チャート、サマリー、保有株式、アラートを読む |
| 自動更新を入れる | チャートを 10 秒ごとに読み直す |
| 保有株式を追加・編集する | [保有株式 API](../api/holdings.md) で登録・更新し、保有株式とアラートを読み直す |
| 保有株式を削除する | 削除前にその銘柄の売りアラートを取り、確認の中に出す。[保有株式 API](../api/holdings.md) で削除したあと、売りアラートも[アラート API](../api/alerts.md) で削除する。売りアラートの削除に失敗したものがあれば、その旨を出す |
| アラートの「買い追加」「売り追加」 | アラート設定ダイアログで[アラート API](../api/alerts.md) に登録する。初めて登録するときは通知の許可を求める |
| アラートを編集・削除する | [アラート API](../api/alerts.md) で更新・削除し、読み直す |

読み込みは、[取引所 API](../api/exchanges.md)、[ティッカー API](../api/tickers.md)、[チャート API](../api/chart.md)、[サマリー API](../api/summaries.md)、[保有株式 API](../api/holdings.md)、[アラート API](../api/alerts.md) を使う。

## 画面の見た目

### 選択前

取引所とティッカーを選ぶ前。チャートの領域に選択を促す表示が出る。

| スマホ | PC |
|---|---|
| ![トップ画面 選択前 (スマホ)](../../../images/specs/stock-tracker/screen/home-unselected-mobile.png) | ![トップ画面 選択前 (PC)](../../../images/specs/stock-tracker/screen/home-unselected-desktop.png) |

### 銘柄を選んだ状態

チャート、サマリー、保有株式、アラートが並ぶ。

| スマホ | PC |
|---|---|
| ![トップ画面 銘柄を選んだ状態 (スマホ)](../../../images/specs/stock-tracker/screen/home-selected-mobile.png) | ![トップ画面 銘柄を選んだ状態 (PC)](../../../images/specs/stock-tracker/screen/home-selected-desktop.png) |

### 保有株式もアラートもない銘柄

保有株式は「保有なし」、アラートは「アラートなし」になり、「追加」から登録できる。サマリーが取れない銘柄では、サマリーの欄に取得失敗の表示が出る。

| スマホ | PC |
|---|---|
| ![トップ画面 保有株式もアラートもない銘柄 (スマホ)](../../../images/specs/stock-tracker/screen/home-no-holding-no-alert-mobile.png) | ![トップ画面 保有株式もアラートもない銘柄 (PC)](../../../images/specs/stock-tracker/screen/home-no-holding-no-alert-desktop.png) |

### 保有株式の登録ダイアログ

保有株式の「追加」で開く。取引所とティッカーは選択中のものが入る。

| スマホ | PC |
|---|---|
| ![トップ画面 保有株式の登録ダイアログ (スマホ)](../../../images/specs/stock-tracker/screen/home-holding-dialog-mobile.png) | ![トップ画面 保有株式の登録ダイアログ (PC)](../../../images/specs/stock-tracker/screen/home-holding-dialog-desktop.png) |

### アラート設定ダイアログ

「買い追加」「売り追加」で開く。株価チャートを見ながら条件を決める。

| スマホ | PC |
|---|---|
| ![トップ画面 アラート設定ダイアログ (スマホ)](../../../images/specs/stock-tracker/screen/home-alert-dialog-mobile.png) | ![トップ画面 アラート設定ダイアログ (PC)](../../../images/specs/stock-tracker/screen/home-alert-dialog-desktop.png) |

### サマリーの詳細ダイアログ

サマリーの「詳細」で開く。確度の内訳と日足チャートを見られる。

| スマホ | PC |
|---|---|
| ![トップ画面 サマリーの詳細ダイアログ (スマホ)](../../../images/specs/stock-tracker/screen/home-summary-dialog-mobile.png) | ![トップ画面 サマリーの詳細ダイアログ (PC)](../../../images/specs/stock-tracker/screen/home-summary-dialog-desktop.png) |

### 保有株式の削除確認

その銘柄の売りアラートも合わせて削除されることを、確認の中に並べる。

| スマホ | PC |
|---|---|
| ![トップ画面 保有株式の削除確認 (スマホ)](../../../images/specs/stock-tracker/screen/home-holding-delete-dialog-mobile.png) | ![トップ画面 保有株式の削除確認 (PC)](../../../images/specs/stock-tracker/screen/home-holding-delete-dialog-desktop.png) |

### チャートの取得に失敗したとき

チャートの領域にエラーを出す。ほかの欄は表示する。

| スマホ | PC |
|---|---|
| ![トップ画面 チャートの取得に失敗したとき (スマホ)](../../../images/specs/stock-tracker/screen/home-chart-error-mobile.png) | ![トップ画面 チャートの取得に失敗したとき (PC)](../../../images/specs/stock-tracker/screen/home-chart-error-desktop.png) |

### 閲覧だけできるロール (`stock-viewer`)

追加・編集・削除のボタンと、管理画面へのリンクが出ない。

| スマホ | PC |
|---|---|
| ![トップ画面 閲覧だけできるロール (`stock-viewer`) (スマホ)](../../../images/specs/stock-tracker/screen/home-viewer-mobile.png) | ![トップ画面 閲覧だけできるロール (`stock-viewer`) (PC)](../../../images/specs/stock-tracker/screen/home-viewer-desktop.png) |

## つながり

```mermaid
flowchart TD
    N[ヘッダー] --> H[トップ画面]
    H -->|選択肢・チャート・サマリー| A1[取引所 API / ティッカー API<br/>チャート API / サマリー API]
    H -->|保有株式・アラートの<br/>読み込みと編集| A2[保有株式 API<br/>アラート API]
    H -->|クイックアクション| P[保有株式・アラート<br/>サマリー・管理の画面]
```
