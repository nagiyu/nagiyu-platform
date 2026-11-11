---
id: auth/screen/tokushoho
title: 特定商取引法画面
kind: screen
service: auth
sources:
  - services/auth/web/src/app/legal/tokushoho/page.tsx
  - libs/ui/src/components/legal/CommercialTransactionsTable.tsx
  - libs/ui/src/data/commercialTransactionsData.ts
sources_hash: b389378f9d139ad53e107ee8c891129ef2c5b9d7a31131f7e95aab2a74db7ff8
related_cards: [auth/screen/plans]
related_adr:
  - services/auth/architecture.md#ADR-011
  - services/auth/architecture.md#ADR-012
---

# 特定商取引法画面

有料プランの販売に必要な「特定商取引法に基づく表記」を載せた公開ページ。

## 入口

- パスは `/legal/tokushoho`。ログインなしで開ける (ミドルウェアが `/legal` 配下を通す)
- 全画面のフッターの「特定商取引法に基づく表記」と、[プラン画面](./plans.md)のリンクから来る

## 表示するもの

- 見出し「特定商取引法に基づく表記」と、項目名と内容の表。表は共通の部品 (`CommercialTransactionsTable`) で描き、項目の文面は共通ライブラリが持つ
- 表の中のプランへのリンクは `/plans`、連絡先は `mailto:` のリンク
- 狭い画面では、項目名と内容を縦に積む

## 操作

| 操作 | 結果 |
|---|---|
| プランへのリンク | [プラン画面](./plans.md)を開く |

## 画面の見た目

### 通常表示

項目名と内容の表。

| スマホ | PC |
|---|---|
| ![特定商取引法画面 通常表示 (スマホ)](../../../images/specs/auth/screen/tokushoho-default-mobile.png) | ![特定商取引法画面 通常表示 (PC)](../../../images/specs/auth/screen/tokushoho-default-desktop.png) |


## つながり

```mermaid
flowchart TD
    F[フッター] --> T[特定商取引法画面]
    P[プラン画面] --> T
    T -->|プランへのリンク| P
```
